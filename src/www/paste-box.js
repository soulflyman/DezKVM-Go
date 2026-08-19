/*
    paste-box.js

    This script implements the Paste Box functionality, allowing users to
    input text and send it as simulated keyboard input to the remote system
    via HID.
*/

const PASTE_BOX_MAX_CHARS = 1000;
let pasteBoxActive = false;
let pasteCancelled = false;

// AI-assisted addition: USB HID Keyboard/Keypad Usage Table (Page 0x07) opcodes, named for
// readability - same values used by HIDController.codeToHIDOpcode() in local-kvm.js.
const HID_OP = {
    A: 0x04, B: 0x05, C: 0x06, D: 0x07, E: 0x08, F: 0x09, G: 0x0A, H: 0x0B,
    I: 0x0C, J: 0x0D, K: 0x0E, L: 0x0F, M: 0x10, N: 0x11, O: 0x12, P: 0x13,
    Q: 0x14, R: 0x15, S: 0x16, T: 0x17, U: 0x18, V: 0x19, W: 0x1A, X: 0x1B,
    Y: 0x1C, Z: 0x1D,
    D1: 0x1E, D2: 0x1F, D3: 0x20, D4: 0x21, D5: 0x22, D6: 0x23, D7: 0x24, D8: 0x25, D9: 0x26, D0: 0x27,
    ENTER: 0x28, TAB: 0x2B, SPACE: 0x2C,
    MINUS: 0x2D, EQUAL: 0x2E, BRACKET_LEFT: 0x2F, BRACKET_RIGHT: 0x30, BACKSLASH: 0x31,
    SEMICOLON: 0x33, QUOTE: 0x34, BACKQUOTE: 0x35, COMMA: 0x36, PERIOD: 0x37, SLASH: 0x38,
    INTL_BACKSLASH: 0x64, // ISO extra key between Left Shift and Z (German/European '<>|')
};

// AI-assisted addition: per-remote-keyboard-layout character tables, replacing the old
// single US-only charToKeyCode table. Each entry is { opcode, shift, altgr } - the physical
// HID key plus which modifier(s) to hold - because the *character produced* by a given
// physical key depends entirely on the remote OS's own configured layout, exactly like live
// keyboard forwarding (see codeToHIDOpcode() in local-kvm.js). Selected via the "Paste
// Keyboard Layout" setting (pasteKeyboardLayout global, set from settings.html).
const PASTE_LAYOUTS = {
    // US QWERTY - functionally identical to the old charToKeyCode table, just opcode-based.
    us: {
        '0': { opcode: HID_OP.D0 }, '1': { opcode: HID_OP.D1 }, '2': { opcode: HID_OP.D2 },
        '3': { opcode: HID_OP.D3 }, '4': { opcode: HID_OP.D4 }, '5': { opcode: HID_OP.D5 },
        '6': { opcode: HID_OP.D6 }, '7': { opcode: HID_OP.D7 }, '8': { opcode: HID_OP.D8 },
        '9': { opcode: HID_OP.D9 },
        'a': { opcode: HID_OP.A }, 'b': { opcode: HID_OP.B }, 'c': { opcode: HID_OP.C },
        'd': { opcode: HID_OP.D }, 'e': { opcode: HID_OP.E }, 'f': { opcode: HID_OP.F },
        'g': { opcode: HID_OP.G }, 'h': { opcode: HID_OP.H }, 'i': { opcode: HID_OP.I },
        'j': { opcode: HID_OP.J }, 'k': { opcode: HID_OP.K }, 'l': { opcode: HID_OP.L },
        'm': { opcode: HID_OP.M }, 'n': { opcode: HID_OP.N }, 'o': { opcode: HID_OP.O },
        'p': { opcode: HID_OP.P }, 'q': { opcode: HID_OP.Q }, 'r': { opcode: HID_OP.R },
        's': { opcode: HID_OP.S }, 't': { opcode: HID_OP.T }, 'u': { opcode: HID_OP.U },
        'v': { opcode: HID_OP.V }, 'w': { opcode: HID_OP.W }, 'x': { opcode: HID_OP.X },
        'y': { opcode: HID_OP.Y }, 'z': { opcode: HID_OP.Z },
        '!': { opcode: HID_OP.D1, shift: true }, '@': { opcode: HID_OP.D2, shift: true },
        '#': { opcode: HID_OP.D3, shift: true }, '$': { opcode: HID_OP.D4, shift: true },
        '%': { opcode: HID_OP.D5, shift: true }, '^': { opcode: HID_OP.D6, shift: true },
        '&': { opcode: HID_OP.D7, shift: true }, '*': { opcode: HID_OP.D8, shift: true },
        '(': { opcode: HID_OP.D9, shift: true }, ')': { opcode: HID_OP.D0, shift: true },
        ' ': { opcode: HID_OP.SPACE },
        '-': { opcode: HID_OP.MINUS }, '_': { opcode: HID_OP.MINUS, shift: true },
        '=': { opcode: HID_OP.EQUAL }, '+': { opcode: HID_OP.EQUAL, shift: true },
        '[': { opcode: HID_OP.BRACKET_LEFT }, '{': { opcode: HID_OP.BRACKET_LEFT, shift: true },
        ']': { opcode: HID_OP.BRACKET_RIGHT }, '}': { opcode: HID_OP.BRACKET_RIGHT, shift: true },
        '\\': { opcode: HID_OP.BACKSLASH }, '|': { opcode: HID_OP.BACKSLASH, shift: true },
        ';': { opcode: HID_OP.SEMICOLON }, ':': { opcode: HID_OP.SEMICOLON, shift: true },
        "'": { opcode: HID_OP.QUOTE }, '"': { opcode: HID_OP.QUOTE, shift: true },
        ',': { opcode: HID_OP.COMMA }, '<': { opcode: HID_OP.COMMA, shift: true },
        '.': { opcode: HID_OP.PERIOD }, '>': { opcode: HID_OP.PERIOD, shift: true },
        '/': { opcode: HID_OP.SLASH }, '?': { opcode: HID_OP.SLASH, shift: true },
        '`': { opcode: HID_OP.BACKQUOTE }, '~': { opcode: HID_OP.BACKQUOTE, shift: true },
        '\n': { opcode: HID_OP.ENTER }, '\t': { opcode: HID_OP.TAB },
    },
    // German QWERTZ. Note Y/Z are swapped vs US (same physical-position swap already applied
    // for live typing), and several symbols live behind AltGr rather than Shift. The two
    // dead-key positions (acute ´ on Equal, circumflex ^ on Backquote) are intentionally
    // omitted - sending either alone would only arm the remote's compose state, not produce
    // a character, so they fall through to "unsupported" like any other unmapped character.
    de: {
        '0': { opcode: HID_OP.D0 }, '1': { opcode: HID_OP.D1 }, '2': { opcode: HID_OP.D2 },
        '3': { opcode: HID_OP.D3 }, '4': { opcode: HID_OP.D4 }, '5': { opcode: HID_OP.D5 },
        '6': { opcode: HID_OP.D6 }, '7': { opcode: HID_OP.D7 }, '8': { opcode: HID_OP.D8 },
        '9': { opcode: HID_OP.D9 },
        'a': { opcode: HID_OP.A }, 'b': { opcode: HID_OP.B }, 'c': { opcode: HID_OP.C },
        'd': { opcode: HID_OP.D }, 'e': { opcode: HID_OP.E }, 'f': { opcode: HID_OP.F },
        'g': { opcode: HID_OP.G }, 'h': { opcode: HID_OP.H }, 'i': { opcode: HID_OP.I },
        'j': { opcode: HID_OP.J }, 'k': { opcode: HID_OP.K }, 'l': { opcode: HID_OP.L },
        'm': { opcode: HID_OP.M }, 'n': { opcode: HID_OP.N }, 'o': { opcode: HID_OP.O },
        'p': { opcode: HID_OP.P }, 'q': { opcode: HID_OP.Q }, 'r': { opcode: HID_OP.R },
        's': { opcode: HID_OP.S }, 't': { opcode: HID_OP.T }, 'u': { opcode: HID_OP.U },
        'v': { opcode: HID_OP.V }, 'w': { opcode: HID_OP.W }, 'x': { opcode: HID_OP.X },
        'y': { opcode: HID_OP.Z }, 'z': { opcode: HID_OP.Y }, // swapped vs US
        '!': { opcode: HID_OP.D1, shift: true }, '"': { opcode: HID_OP.D2, shift: true },
        '§': { opcode: HID_OP.D3, shift: true }, // section sign (Shift+3 on German)
        '$': { opcode: HID_OP.D4, shift: true }, '%': { opcode: HID_OP.D5, shift: true },
        '&': { opcode: HID_OP.D6, shift: true },
        '/': { opcode: HID_OP.D7, shift: true }, '{': { opcode: HID_OP.D7, altgr: true },
        '(': { opcode: HID_OP.D8, shift: true }, '[': { opcode: HID_OP.D8, altgr: true },
        ')': { opcode: HID_OP.D9, shift: true }, ']': { opcode: HID_OP.D9, altgr: true },
        '=': { opcode: HID_OP.D0, shift: true }, '}': { opcode: HID_OP.D0, altgr: true },
        ' ': { opcode: HID_OP.SPACE },
        'ß': { opcode: HID_OP.MINUS },                      // ß
        '?': { opcode: HID_OP.MINUS, shift: true },
        '\\': { opcode: HID_OP.MINUS, altgr: true },
        'ü': { opcode: HID_OP.BRACKET_LEFT },                // ü
        'Ü': { opcode: HID_OP.BRACKET_LEFT, shift: true },   // Ü
        '+': { opcode: HID_OP.BRACKET_RIGHT }, '*': { opcode: HID_OP.BRACKET_RIGHT, shift: true },
        '~': { opcode: HID_OP.BRACKET_RIGHT, altgr: true },
        '#': { opcode: HID_OP.BACKSLASH }, "'": { opcode: HID_OP.BACKSLASH, shift: true },
        'ö': { opcode: HID_OP.SEMICOLON },                   // ö
        'Ö': { opcode: HID_OP.SEMICOLON, shift: true },      // Ö
        'ä': { opcode: HID_OP.QUOTE },                       // ä
        'Ä': { opcode: HID_OP.QUOTE, shift: true },          // Ä
        ',': { opcode: HID_OP.COMMA }, ';': { opcode: HID_OP.COMMA, shift: true },
        '.': { opcode: HID_OP.PERIOD }, ':': { opcode: HID_OP.PERIOD, shift: true },
        '-': { opcode: HID_OP.SLASH }, '_': { opcode: HID_OP.SLASH, shift: true },
        '<': { opcode: HID_OP.INTL_BACKSLASH }, '>': { opcode: HID_OP.INTL_BACKSLASH, shift: true },
        '|': { opcode: HID_OP.INTL_BACKSLASH, altgr: true },
        '@': { opcode: HID_OP.Q, altgr: true },
        '€': { opcode: HID_OP.E, altgr: true },              // €
        'µ': { opcode: HID_OP.M, altgr: true },              // µ
        '\n': { opcode: HID_OP.ENTER }, '\t': { opcode: HID_OP.TAB },
    },
};

function updatePasteBoxCharCounter() {
    const textarea = document.getElementById('pasteTextarea');
    const counter = document.getElementById('pasteCharCounter');
    const currentLength = textarea.value.length;
    counter.textContent = `${currentLength} / ${PASTE_BOX_MAX_CHARS}`;
    
    if (currentLength >= PASTE_BOX_MAX_CHARS) {
        counter.style.color = '#db2828';
    } else if (currentLength >= PASTE_BOX_MAX_CHARS * 0.9) {
        counter.style.color = '#f2711c';
    } else {
        counter.style.color = '#767676';
    }
}

function showPasteBox() {
    const pasteBox = document.getElementById('pasteBox');
    const textarea = document.getElementById('pasteTextarea');
    
    if (!textarea) {
        console.error('Paste box content not loaded yet');
        return;
    }
    
    pasteBox.style.display = 'flex';
    pasteBoxActive = true;

    // Use setTimeout to ensure display is updated before focus
    setTimeout(() => {
        textarea.focus();
    }, 0);

    updatePasteBoxCharCounter();

    // AI-assisted addition: sync the layout dropdown to the current remote layout every time
    // the popup opens, rather than only once at page load - the underlying setting (shared
    // with Settings > Keyboard & Mouse via setPasteKeyboardLayout()/localStorage) may have
    // finished loading after this popup's own script ran.
    if (typeof $ !== 'undefined' && $('#pasteLayoutDropdown').length) {
        const current = (typeof pasteKeyboardLayout !== 'undefined') ? pasteKeyboardLayout : 'us';
        $('#pasteLayoutDropdown').dropdown('set selected', current);
    }
}

function closePasteBox() {
    const pasteBox = document.getElementById('pasteBox');
    pasteBox.style.display = 'none';
    pasteBoxActive = false;
}

function clearPasteBox() {
    document.getElementById('pasteTextarea').value = '';
    updatePasteBoxCharCounter();
}

// AI-assisted change: presses/releases only the opcode itself. Shift/AltGr are handled
// separately by applyModifierState() below, which - like a human holding Shift while typing
// several capital letters - only toggles a modifier when the required state actually
// changes between characters, instead of re-pressing/releasing it for every single
// character. This is what live keyboard forwarding already does implicitly (one real
// keydown/keyup per physical Shift press, not per letter); sendPasteText() now mirrors that.
async function sendKeyPress(opcode) {
    if (typeof controller === 'undefined' || !controller) return;

    await controller.SendKeyboardPressOpcode(opcode);
    await controller.SendKeyboardReleaseOpcode(opcode);
}

// AI-assisted addition: tracks which modifiers sendPasteText() currently holds down on the
// remote (module-level since only one paste can run at a time - the Send button is hidden
// for the duration) and only sends a press/release when the desired state differs from what's
// already held, instead of toggling Shift/AltGr around every character. Callers must call
// applyModifierState(false, false) in a finally block once the paste loop ends (success,
// cancel, or error) so a stuck modifier can never leak into subsequent live typing.
let pasteShiftHeld = false;
let pasteAltgrHeld = false;

async function applyModifierState(shift, altgr) {
    if (typeof controller === 'undefined' || !controller) return;

    if (shift !== pasteShiftHeld) {
        if (shift) {
            await controller.SendKeyboardPress(16);
        } else {
            await controller.SendKeyboardRelease(16).catch(() => {});
        }
        pasteShiftHeld = shift;
    }
    if (altgr !== pasteAltgrHeld) {
        if (altgr) {
            await controller.SetModifierKey(18, true); // AltGr = right Alt
        } else {
            await controller.UnsetModifierKey(18, true).catch(() => {});
        }
        pasteAltgrHeld = altgr;
    }
}

function cancelPasteText() {
    pasteCancelled = true;
    $('body').toast({
        message: '<i class="orange exclamation icon"></i> Paste operation cancelled'
    });
}

async function sendPasteText() {
    const textarea = document.getElementById('pasteTextarea');
    const text = textarea.value;
    const progressBar = document.getElementById('pasteProgressBar');
    const sendButton = document.getElementById('btnSendPaste');
    const clearButton = document.getElementById('btnClearPaste');
    const cancelButton = document.getElementById('btnCancelPaste');
    
    if (!text) {
        $('body').toast({
            message: '<i class="yellow exclamation triangle icon"></i> No text to send',
        });
        return;
    }

    // AI-assisted fix: `controller` is a singleton instantiated unconditionally at page
    // load (local-kvm.js), so it's always truthy regardless of whether the serial port is
    // actually open - checking it here never caught "not connected". Check the real serial
    // state instead, matching the guard style already used elsewhere (e.g. MouseMoveAbsolute
    // in local-kvm.js). Without this, sending started anyway and the first character threw
    // deep inside the send path, leaving the modal stuck - see the try/finally below.
    if (typeof serialPort === 'undefined' || !serialPort || !serialPort.writable ||
        typeof serialWriter === 'undefined' || !serialWriter) {
        $('body').toast({
            message: '<i class="red times circle icon"></i> Serial port not connected',
        });
        return;
    }

    const estimatedTimeMs = text.length * 40;
    if (estimatedTimeMs > 10000) {
        const proceed = confirm(`Sending this text may take approximately ${(estimatedTimeMs / 1000).toFixed(1)} seconds. Do you want to proceed?`);
        if (!proceed) return;
    }

    pasteCancelled = false;
    sendButton.style.display = 'none';
    clearButton.style.display = 'none';
    cancelButton.style.display = 'inline-block';
    textarea.disabled = true;
    progressBar.style.display = 'block';
    $('#pasteProgressBar').progress({ percent: 0 });

    let sentCount = 0;
    let skippedCount = 0;
    let sendError = null;

    // AI-assisted fix: the button/textarea/progress-bar reset used to live only after this
    // loop, so if a character send threw (e.g. the device disconnects mid-paste, or a real
    // serial error) the function exited via an unhandled rejection and the modal was stuck
    // showing "Sending..." forever - Cancel couldn't even help, since the loop that checks
    // pasteCancelled had already exited. The finally block guarantees the UI always resets,
    // regardless of how the loop ends (completion, cancellation, or an exception).
    try {
        for (let i = 0; i < text.length; i++) {
            if (pasteCancelled) break;

            const char = text[i];

            // AI-assisted change: layout-driven lookup, see PASTE_LAYOUTS above. Uppercase
            // Latin letters aren't listed individually in the tables (their physical key is
            // the same as the lowercase letter on every layout) - reuse the lowercase
            // entry's opcode with Shift forced on. Letters with their own dedicated
            // uppercase entry (e.g. German Ü/Ö/Ä) are matched directly above this and never
            // reach the fallback.
            const layout = PASTE_LAYOUTS[pasteKeyboardLayout] || PASTE_LAYOUTS.us;
            let mapping = layout[char];
            if (!mapping && char >= 'A' && char <= 'Z') {
                const lower = layout[char.toLowerCase()];
                if (lower) mapping = { opcode: lower.opcode, shift: true, altgr: lower.altgr };
            }

            if (mapping) {
                await applyModifierState(!!mapping.shift, !!mapping.altgr);
                await sendKeyPress(mapping.opcode);
                sentCount++;
            } else {
                skippedCount++;
            }

            const progress = ((i + 1) / text.length) * 100;
            $('#pasteProgressBar').progress('set percent', progress);
        }
    } catch (err) {
        console.error('Paste to Remote: sending failed', err);
        sendError = err;
    } finally {
        // Guarantee no modifier is left held on the remote, regardless of how the loop
        // ended (completion, cancellation, or an exception) - see applyModifierState().
        await applyModifierState(false, false).catch(() => {});
        sendButton.style.display = 'inline-block';
        clearButton.style.display = 'inline-block';
        cancelButton.style.display = 'none';
        textarea.disabled = false;
        progressBar.style.display = 'none';
    }

    if (sendError) {
        $('body').toast({
            message: `<i class="red exclamation icon"></i> Sending failed: ${sendError.message}`,
        });
        return; // leave the typed text in the box so the user can retry after reconnecting
    }

    if (!pasteCancelled) {
        let message = `<i class="green check circle icon"></i> Sent ${sentCount} characters`;
        if (skippedCount > 0) {
            message += `, skipped ${skippedCount} unsupported characters`;
        }
        $('body').toast({ message: message });
        clearPasteBox();
        closePasteBox();
    }
}


// Initialize event listeners after content is loaded
$('#btnClosePaste').on('click', closePasteBox);
$('#btnClearPaste').on('click', clearPasteBox);
$('#btnSendPaste').on('click', sendPasteText);
$('#btnCancelPaste').on('click', cancelPasteText);
$('#pasteTextarea').on('input', updatePasteBoxCharCounter);

// AI-assisted addition: Remote Layout dropdown, relocated here from Settings > Keyboard &
// Mouse so it's reachable right where it's used. Still persisted the same way as before -
// setPasteKeyboardLayout() (local-kvm.js) updates the shared global that sendPasteText()
// reads, and saveSettingsToLocalStorage() (settings.html) writes it to the same
// localStorage-backed settings object as every other setting.
$('#pasteLayoutDropdown').dropdown({
    onChange: function(value) {
        if (typeof window.setPasteKeyboardLayout === 'function') {
            window.setPasteKeyboardLayout(value);
        }
        if (typeof window.saveSettingsToLocalStorage === 'function') {
            window.saveSettingsToLocalStorage();
        }
    }
});

// Show paste box button listener
$('#showPasteBox').on('click', function(){
    showPasteBox();
});

// Intercept paste events when "Ask on paste" is enabled
window.addEventListener('paste', async (e) => {
    // Only intercept if askOnPaste is enabled and paste box is not already active
    if (!askOnPasteEnabled || pasteBoxActive) {
        if (!askOnPasteEnabled) {
            //Send Ctrl+V directly to remote without showing paste box or confirmation
            await sendCtrlVToRemote(false);
        }
        return;
    }
    
    // Prevent default paste behavior
    e.preventDefault();
    e.stopPropagation();
    
    try {
        // Get clipboard content
        const clipboardText = e.clipboardData.getData('text');
        
        if (!clipboardText) {
            //Clipboard is empty, send Ctrl+V directly to remote to trigger paste from remote clipboard
             await sendCtrlVToRemote();
            return;
        }
        
        // Truncate if too long
        const textToUse = clipboardText.substring(0, PASTE_BOX_MAX_CHARS);
        
        // Fill paste box
        //showPasteBox();
        const textarea = document.getElementById('pasteTextarea');
        textarea.value = textToUse;
        updatePasteBoxCharCounter();
        
        // Show confirmation modal
        showPasteConfirmationModal(textToUse);
        
    } catch (err) {
        console.error('Error intercepting paste:', err);
        $('body').toast({
            message: '<i class="red exclamation icon"></i> Failed to capture clipboard content',
            class: 'error'
        });
    }
});

// Show paste confirmation modal
function showPasteConfirmationModal(clipboardText) {
    // Remove existing modal if any
    $('#pasteConfirmModal').remove();
    
    // Create modal HTML
    const modalHtml = `
        <div class="ui small modal" id="pasteConfirmModal">
            <div class="header">
                <i class="clipboard icon"></i> Paste Action
            </div>
            <div class="content">
                <p>You pressed <strong>Ctrl+V</strong>. What would you like to do?</p>
                <div class="ui message">
                    <p><strong>Send Ctrl+V to Remote:</strong> Just sends the keyboard shortcut (remote system will paste from its own clipboard)</p>
                    <p><strong>Send Clipboard Content:</strong> Types out the captured text character by character (${clipboardText.length} characters)</p>
                </div>
                <small>Tips: You can disable this confirmation in settings if you prefer to always send Ctrl + V.</small>
            </div>
            <div class="actions">
                <div class="ui cancel button">
                    <i class="times icon"></i> Cancel
                </div>
                <div class="ui basic button" id="btnSendCtrlV">
                    <i class="orange keyboard icon"></i> Send Ctrl+V to Remote
                </div>
                <div class="ui basic button" id="btnSendClipboard">
                    <i class="blue paper plane icon"></i> Send Clipboard Content
                </div>
            </div>
        </div>
    `;
    
    // Add modal to body
    $('body').append(modalHtml);
    
    // Initialize and show modal
    $('#pasteConfirmModal').modal({
        closable: true,
        onHidden: function() {
            $(this).remove();
        }
    }).modal('show');
    
    // Handle "Send Ctrl+V to Remote" button
    $('#btnSendCtrlV').on('click', async function() {
        $('#pasteConfirmModal').modal('hide');
        await sendCtrlVToRemote();
    });
    
    // Handle "Send Clipboard Content" button
    $('#btnSendClipboard').on('click', async function() {
        $('#pasteConfirmModal').modal('hide');
        await sendPasteText();
    });
}

// Send Ctrl+V (or CMD+V if CTRL↔CMD swap is enabled) keyboard combination to remote
async function sendCtrlVToRemote(showToast=true) {
    if (typeof controller === 'undefined' || !controller) {
        $('body').toast({
            message: '<i class="red times circle icon"></i> HID not connected',
            class: 'error'
        });
        return;
    }
    
    // Use swapCtrlCmd to respect CTRL↔CMD swap setting
    const modifierKeyCode = (typeof swapCtrlCmd === 'function') ? swapCtrlCmd(17) : 17;
    const label = modifierKeyCode === 91 ? 'CMD+V' : 'Ctrl+V';
    
    try {
        // Press Ctrl (or CMD if swapped)
        await controller.SetModifierKey(modifierKeyCode, false);
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Press V
        await controller.SendKeyboardPress(86); // V key
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Release V
        await controller.SendKeyboardRelease(86);
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Release Ctrl (or CMD if swapped)
        await controller.UnsetModifierKey(modifierKeyCode, false);
        
        if (showToast) {
            $('body').toast({
                message: `<i class="green check circle icon"></i> ${label} sent to remote`,
            });
        }
            
        closePasteBox();
    } catch (err) {
        console.error(`Error sending ${label}:`, err);
        $('body').toast({
            message: `<i class="red exclamation icon"></i> Failed to send ${label}`,
        });
    }
}
