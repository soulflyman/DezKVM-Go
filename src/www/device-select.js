/*
    device-select.js

    This file was written by an AI coding assistant (Claude) to address
    https://github.com/tobychui/DezKVM-Go/issues/11: manual capture-device selection with a
    live preview, for cases where automatic VID:PID detection fails or picks the wrong
    device (Firefox never exposes VID/PID in device labels; a machine with two DezKVM-Go
    units plugged in needs a way to pick which one this session should use).

    Exposes (consumed defensively via `typeof x === 'function'` from local-kvm.js, since
    this fragment loads asynchronously and may not be ready yet on first page load):
      - openDeviceSelectDialog()
      - isDeviceSelectDialogOpen()
      - resolveManualDeviceSelection(devices)
*/

const DEVICE_SELECT_KEY = 'dezkvm_manual_device_selection';
let deviceSelectPreviewStream = null;

// --- Persistence -----------------------------------------------------------
// Stored shape: { video: {deviceId, label, groupId}, audio: {deviceId, label, groupId}|null }
// Resolution prefers deviceId (stable across reloads while permission persists, e.g. Chrome)
// and falls back to label (needed on browsers where deviceId can rotate between sessions).

function saveManualDeviceSelection(videoDevice, audioDevice) {
    try {
        const record = {
            video: videoDevice ? { deviceId: videoDevice.deviceId, label: videoDevice.label, groupId: videoDevice.groupId } : null,
            audio: audioDevice ? { deviceId: audioDevice.deviceId, label: audioDevice.label, groupId: audioDevice.groupId } : null,
        };
        localStorage.setItem(DEVICE_SELECT_KEY, JSON.stringify(record));
    } catch (e) {}
}

function clearManualDeviceSelection() {
    try { localStorage.removeItem(DEVICE_SELECT_KEY); } catch (e) {}
}

function loadManualDeviceSelection() {
    try {
        const raw = localStorage.getItem(DEVICE_SELECT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function resolveDeviceRecord(devices, kind, record) {
    if (!record) return null;
    // Prefer an exact deviceId match, fall back to label (deviceId isn't guaranteed stable
    // across sessions on every browser). A stale selection (device unplugged/renamed)
    // resolves to null - callers should silently ignore that, not treat it as an error.
    const byId = devices.find(d => d.kind === kind && d.deviceId === record.deviceId);
    if (byId) return byId;
    if (record.label) {
        const byLabel = devices.find(d => d.kind === kind && d.label === record.label);
        if (byLabel) return byLabel;
    }
    return null;
}

function resolveManualDeviceSelection(devices) {
    const stored = loadManualDeviceSelection();
    if (!stored) return null;
    return {
        videoDevice: resolveDeviceRecord(devices, 'videoinput', stored.video),
        audioDevice: resolveDeviceRecord(devices, 'audioinput', stored.audio),
    };
}

// --- Dialog state ------------------------------------------------------------

function isDeviceSelectDialogOpen() {
    const modal = document.getElementById('deviceSelectModal');
    return !!(modal && modal.classList.contains('active'));
}

function currentlyStreamingDeviceId() {
    if (!window.currentStream) return null;
    const track = window.currentStream.getVideoTracks()[0];
    return track ? track.getSettings().deviceId : null;
}

async function stopPreviewStream() {
    if (deviceSelectPreviewStream) {
        for (const track of deviceSelectPreviewStream.getTracks()) {
            track.stop();
        }
        deviceSelectPreviewStream = null;
    }
    const previewVideo = document.getElementById('deviceSelectPreviewVideo');
    if (previewVideo) previewVideo.srcObject = null;
}

async function startPreview(deviceId) {
    const statusElem = document.getElementById('deviceSelectPreviewStatus');
    const previewVideo = document.getElementById('deviceSelectPreviewVideo');
    if (!deviceId) return;

    // Must fully release the previous preview handle before opening the next one - a
    // lingering preview stream on the device the user just picked would otherwise make the
    // real startStream() acquisition fail with NotReadableError right after confirming.
    await stopPreviewStream();

    if (deviceId === currentlyStreamingDeviceId()) {
        if (statusElem) statusElem.textContent = 'Currently in use by this session';
        return;
    }

    if (statusElem) statusElem.textContent = 'Loading preview…';
    try {
        deviceSelectPreviewStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId } },
        });
        if (previewVideo) previewVideo.srcObject = deviceSelectPreviewStream;
        if (statusElem) statusElem.textContent = '';
    } catch (e) {
        console.warn('Device select preview failed:', e);
        if (statusElem) statusElem.textContent = 'Preview unavailable (device may be in use)';
    }
}

function deviceLabel(device, kind, index) {
    if (device.label) return device.label;
    return (kind === 'videoinput' ? 'Camera ' : 'Microphone ') + (index + 1);
}

function populateDropdown(selectId, devices, kind, selectedDeviceId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '';
    if (kind === 'audioinput') {
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '(None)';
        select.appendChild(noneOption);
    }
    devices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = deviceLabel(device, kind, index);
        select.appendChild(option);
    });
    // AI-assisted fix for #11: intentionally NOT using Fomantic's `.dropdown()` JS
    // enhancement here. That module converts a `<select>` into a wrapper `<div>` and moves
    // the original (now-hidden) select inside it, re-parenting where the module instance
    // and value live - repopulating options and then calling `.dropdown('set selected', ...)`
    // on the original element id afterward is a well-known way to end up re-initializing
    // (duplicating) the widget instead of updating it. A native <select> avoids that whole
    // class of DOM-reassignment bugs; Fomantic's CSS still styles it via the `ui dropdown`
    // classes, just without the JS behavior.
    select.value = selectedDeviceId || '';
}

async function openDeviceSelectDialog() {
    // Ensure device labels are populated (needed on Firefox, and before first permission
    // grant in general) by reusing local-kvm.js's existing permission-request helper.
    let devices = await navigator.mediaDevices.enumerateDevices();
    const hasLabels = devices.some(d => d.kind === 'videoinput' && d.label);
    if (!hasLabels && typeof requestMediaDevicePermission === 'function') {
        try {
            await requestMediaDevicePermission();
            devices = await navigator.mediaDevices.enumerateDevices();
        } catch (e) {
            console.warn('Could not obtain media permission for device selection:', e);
        }
    }

    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    const audioDevices = devices.filter(d => d.kind === 'audioinput');

    const manual = resolveManualDeviceSelection(devices);
    const currentVideoId = currentlyStreamingDeviceId();
    const preselectedVideoId = (manual && manual.videoDevice && manual.videoDevice.deviceId)
        || currentVideoId
        || (videoDevices[0] && videoDevices[0].deviceId);
    const preselectedAudioId = (manual && manual.audioDevice && manual.audioDevice.deviceId) || '';

    populateDropdown('deviceSelectVideoDropdown', videoDevices, 'videoinput', preselectedVideoId);
    populateDropdown('deviceSelectAudioDropdown', audioDevices, 'audioinput', preselectedAudioId);

    $('#deviceSelectModal').modal({
        closable: true,
        onHidden: function () { stopPreviewStream(); },
    }).modal('show');

    if (preselectedVideoId) startPreview(preselectedVideoId);
}

$(document).ready(function () {
    // Native <select> change events - see the note in populateDropdown() for why this
    // doesn't use Fomantic's `.dropdown()` JS behavior.
    const videoSelect = document.getElementById('deviceSelectVideoDropdown');
    if (videoSelect) {
        videoSelect.addEventListener('change', (e) => startPreview(e.target.value));
    }

    $('#btnConfirmDeviceSelection').on('click', async function () {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoId = document.getElementById('deviceSelectVideoDropdown').value;
        const audioId = document.getElementById('deviceSelectAudioDropdown').value;
        const videoDevice = devices.find(d => d.kind === 'videoinput' && d.deviceId === videoId) || null;
        const audioDevice = devices.find(d => d.kind === 'audioinput' && d.deviceId === audioId) || null;

        await stopPreviewStream();
        saveManualDeviceSelection(videoDevice, audioDevice);
        $('#deviceSelectModal').modal('hide');

        if (typeof startStream === 'function') startStream();
    });

    $('#btnClearDeviceSelection').on('click', async function () {
        await stopPreviewStream();
        clearManualDeviceSelection();
        $('#deviceSelectModal').modal('hide');
        if (typeof startStream === 'function') startStream();
    });
});
