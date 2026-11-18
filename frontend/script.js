// ==========================================================================
// SAFEGUARD 360 - MISSION-CRITICAL SOS EMERGENCY WORKFLOW & DISPATCH
// ==========================================================================

// Application State
let currentSOSLocation = {
    latitude: null,
    longitude: null,
    mapsUrl: null,
    acquired: false,
    error: null
};

let cachedTrustedContacts = [];

// ==========================================================================
// 1. PHONE NUMBER FORMATTING & VALIDATION UTILITIES
// ==========================================================================

/**
 * Formats a phone number for direct dialer (tel: protocol).
 * Retains leading '+' and digits, strips whitespace, hyphens, and brackets.
 */
function cleanPhoneForTel(phone) {
    if (!phone) return "";
    const cleaned = String(phone).trim().replace(/[^\d+]/g, "");
    return cleaned.length >= 5 ? cleaned : "";
}

/**
 * Formats a phone number for WhatsApp wa.me URL.
 * wa.me requires digits ONLY without '+', spaces, hyphens, or leading 00.
 */
function cleanPhoneForWhatsApp(phone) {
    if (!phone) return "";
    let cleaned = String(phone).replace(/\D/g, "");
    if (cleaned.startsWith("00")) {
        cleaned = cleaned.substring(2);
    }
    return cleaned.length >= 5 ? cleaned : "";
}

/**
 * Formats a phone number for SMS application (sms: protocol).
 */
function cleanPhoneForSMS(phone) {
    if (!phone) return "";
    const cleaned = String(phone).trim().replace(/[^\d+]/g, "");
    return cleaned.length >= 5 ? cleaned : "";
}

/**
 * Generates the standardized emergency message with or without location.
 */
function generateEmergencyMessage(mapsUrl) {
    if (mapsUrl) {
        return "EMERGENCY! I need help. I may be in an unsafe situation. My current location: " + mapsUrl + " . Please contact me immediately.";
    } else {
        return "EMERGENCY! I need help. I may be in an unsafe situation. My location is currently unavailable. Please contact me immediately.";
    }
}

// ==========================================================================
// 2. USER FEEDBACK & NOTIFICATION HELPER
// ==========================================================================

/**
 * Displays an explicit notification banner inside the SOS modal.
 * Adheres strictly to the requirement: avoids claiming a call/message
 * was completed merely because an external app was launched.
 */
function notifyAction(actionType, contactName, phone) {
    const noticeBox = document.getElementById("sos-action-notice");
    if (!noticeBox) return;

    let messageHtml = "";
    if (actionType === "call") {
        messageHtml = "<span>📞</span> <strong>Opening Phone Dialer:</strong> Directing to " + contactName + " (" + phone + ").";
    } else if (actionType === "whatsapp") {
        messageHtml = "<span>💬</span> <strong>Opening WhatsApp:</strong> Directing to " + contactName + ". Please review prefilled message and tap Send.";
    } else if (actionType === "sms") {
        messageHtml = "<span>📱</span> <strong>Opening SMS Messenger:</strong> Directing to " + contactName + ". Please review prefilled message and tap Send.";
    }

    noticeBox.innerHTML = messageHtml;
    noticeBox.style.display = "flex";

    // Auto-scroll modal to keep notice in view
    noticeBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ==========================================================================
// 3. DIRECT ACTION DISPATCHERS (CALL, WHATSAPP, SMS)
// ==========================================================================

/**
 * Opens device dialer using contact's saved phone number.
 */
function triggerCall(phone, name) {
    const cleanPhone = cleanPhoneForTel(phone);
    if (!cleanPhone) {
        alert("Cannot open dialer: Phone number for '" + name + "' is missing or invalid.");
        return;
    }
    notifyAction("call", name, cleanPhone);
    window.location.href = "tel:" + cleanPhone;
}

/**
 * Opens WhatsApp with prefilled emergency message and target contact.
 */
function triggerWhatsApp(phone, name) {
    const cleanPhone = cleanPhoneForWhatsApp(phone);
    if (!cleanPhone) {
        alert("Cannot open WhatsApp: Phone number for '" + name + "' is missing or invalid.");
        return;
    }
    const message = generateEmergencyMessage(currentSOSLocation.mapsUrl);
    notifyAction("whatsapp", name, cleanPhone);

    const waUrl = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(message);
    window.open(waUrl, "_blank", "noopener,noreferrer");
}

/**
 * Opens device SMS messenger with prefilled emergency message and target number.
 */
function triggerSMS(phone, name) {
    const cleanPhone = cleanPhoneForSMS(phone);
    if (!cleanPhone) {
        alert("Cannot open SMS: Phone number for '" + name + "' is missing or invalid.");
        return;
    }
    const message = generateEmergencyMessage(currentSOSLocation.mapsUrl);
    notifyAction("sms", name, cleanPhone);

    // iOS uses '&body=', Android & standards use '?body='
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const separator = isIOS ? "&" : "?";
    const smsUrl = "sms:" + cleanPhone + separator + "body=" + encodeURIComponent(message);
    window.location.href = smsUrl;
}

// ==========================================================================
// 4. ACTIVE SOS MODAL & WORKFLOW
// ==========================================================================

/**
 * Triggered when the user presses the SOS Emergency button.
 * Opens the emergency dispatch console, requests GPS, and retrieves contacts from MongoDB.
 */
function sendSOS() {
    const overlay = document.getElementById("sos-overlay");
    const sosMessage = document.getElementById("sos-message");
    const gpsStatus = document.getElementById("sos-gps-status");
    const gpsCoords = document.getElementById("sos-gps-coords");
    const mapsContainer = document.getElementById("sos-maps-link-container");
    const previewText = document.getElementById("sos-active-message-text");
    const noticeBox = document.getElementById("sos-action-notice");

    // Open active SOS modal
    if (overlay) {
        overlay.style.display = "flex";
        document.body.style.overflow = "hidden"; // Prevent background scroll
    }

    if (noticeBox) {
        noticeBox.style.display = "none";
    }

    if (sosMessage) {
        sosMessage.innerHTML = "🚨 <strong>SOS EMERGENCY ACTIVATED!</strong> Emergency dispatch console open.";
        sosMessage.style.color = "#fca5a5";
    }

    // Reset initial modal location state
    if (gpsStatus) gpsStatus.textContent = "🛰️ Requesting high-accuracy GPS coordinates...";
    if (gpsCoords) gpsCoords.textContent = "Please allow browser location access if prompted.";
    if (mapsContainer) mapsContainer.innerHTML = "";
    if (previewText) previewText.textContent = generateEmergencyMessage(null);

    // Step A: Concurrently retrieve trusted contacts from MongoDB via Flask API
    fetchAndRenderSOSContacts();

    // Step B: Concurrently request browser geolocation
    if (!navigator.geolocation) {
        handleLocationError("Geolocation is not supported by your browser.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function (position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const mapsUrl = "https://www.google.com/maps?q=" + lat + "," + lon;

            currentSOSLocation = {
                latitude: lat,
                longitude: lon,
                mapsUrl: mapsUrl,
                acquired: true,
                error: null
            };

            // Update modal UI
            if (gpsStatus) {
                gpsStatus.innerHTML = "✅ <strong>GPS Coordinates Acquired</strong>";
            }
            if (gpsCoords) {
                gpsCoords.textContent = "Latitude: " + lat.toFixed(6) + " | Longitude: " + lon.toFixed(6) + " (±" + Math.round(position.coords.accuracy) + "m)";
            }
            if (mapsContainer) {
                mapsContainer.innerHTML =
                    '<a href="' + mapsUrl + '" target="_blank" rel="noopener" class="btn btn-primary btn-sm">' +
                    '<span>🗺️</span> View Coordinates on Google Maps' +
                    '</a>';
            }

            const updatedMessage = generateEmergencyMessage(mapsUrl);
            if (previewText) {
                previewText.textContent = updatedMessage;
            }

            // Sync with main page location elements
            const mainLocationText = document.getElementById("user-location");
            if (mainLocationText) {
                mainLocationText.innerHTML = "<strong>📍 Location:</strong> Latitude: " + lat + " | Longitude: " + lon;
            }
            const mainAlertBox = document.getElementById("emergency-alert");
            if (mainAlertBox) {
                mainAlertBox.innerHTML =
                    '<a href="' + mapsUrl + '" target="_blank" rel="noopener">' +
                    '<span>🗺️</span> View Emergency Location on Google Maps' +
                    '</a>';
            }

            // Re-render contact actions with fresh location
            renderSOSContactsList(cachedTrustedContacts);
        },
        function (error) {
            let errorMsg = "Could not obtain location.";
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = "Location permission denied by browser.";
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = "Location information is unavailable.";
                    break;
                case error.TIMEOUT:
                    errorMsg = "Location acquisition timed out.";
                    break;
            }
            handleLocationError(errorMsg);
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}

/**
 * Handles location failure gracefully while keeping all contact actions available.
 */
function handleLocationError(reason) {
    currentSOSLocation = {
        latitude: null,
        longitude: null,
        mapsUrl: null,
        acquired: false,
        error: reason
    };

    const gpsStatus = document.getElementById("sos-gps-status");
    const gpsCoords = document.getElementById("sos-gps-coords");
    const previewText = document.getElementById("sos-active-message-text");

    if (gpsStatus) {
        gpsStatus.innerHTML = "⚠️ <strong>Location Unavailable (" + reason + ")</strong>";
    }
    if (gpsCoords) {
        gpsCoords.textContent = "Emergency alerts will be prepared without automated GPS link. You can still Call, WhatsApp, and SMS your contacts directly below.";
    }
    if (previewText) {
        previewText.textContent = generateEmergencyMessage(null);
    }

    renderSOSContactsList(cachedTrustedContacts);
}

/**
 * Closes the active SOS emergency modal.
 */
function closeSOS() {
    const overlay = document.getElementById("sos-overlay");
    if (overlay) {
        overlay.style.display = "none";
        document.body.style.overflow = ""; // Restore background scroll
    }
}

/**
 * Helper to close SOS modal and smoothly scroll to the contacts registration form.
 */
function closeSOSAndScrollToContacts() {
    closeSOS();
    const section = document.getElementById("trusted-contacts");
    if (section) {
        section.scrollIntoView({ behavior: "smooth" });
        const nameInput = document.getElementById("contact-name");
        if (nameInput) nameInput.focus();
    }
}

/**
 * Fetches actual contacts from MongoDB via Flask API and updates the SOS modal.
 */
async function fetchAndRenderSOSContacts() {
    const listContainer = document.getElementById("sos-contacts-dispatch-list");
    const countBadge = document.getElementById("sos-contacts-count");

    if (listContainer) {
        listContainer.innerHTML = '<div class="empty-state">Retrieving verified contacts from MongoDB...</div>';
    }

    try {
        const response = await fetch("/api/contacts");
        const contacts = await response.json();

        if (!response.ok || !Array.isArray(contacts)) {
            if (listContainer) {
                listContainer.innerHTML = '<div class="empty-state">⚠️ Could not load trusted contacts from database.</div>';
            }
            return;
        }

        cachedTrustedContacts = contacts;
        if (countBadge) {
            countBadge.textContent = contacts.length + (contacts.length === 1 ? " Contact" : " Contacts");
        }

        renderSOSContactsList(contacts);

    } catch (error) {
        console.error("SOS fetch contacts error:", error);
        if (listContainer) {
            listContainer.innerHTML = '<div class="empty-state">⚠️ Connection error: Unable to reach Flask backend.</div>';
        }
    }
}

/**
 * Renders the list of contacts inside the active SOS modal with Call, WhatsApp, and SMS buttons.
 */
function renderSOSContactsList(contacts) {
    const listContainer = document.getElementById("sos-contacts-dispatch-list");
    if (!listContainer) return;

    listContainer.innerHTML = "";

    if (!Array.isArray(contacts) || contacts.length === 0) {
        listContainer.innerHTML =
            '<div class="empty-state" style="padding: 28px 20px;">' +
            '<p style="font-size: 15px; font-weight: 700; color: #fca5a5; margin-bottom: 8px;">⚠️ No Trusted Contacts Registered</p>' +
            '<p style="font-size: 13px; color: var(--slate-300); margin-bottom: 16px;">You must register at least one emergency contact so you can broadcast alerts with one tap.</p>' +
            '<button type="button" class="btn btn-primary btn-sm" onclick="closeSOSAndScrollToContacts()">' +
            '<span>➕</span> Add Trusted Contact Now' +
            '</button>' +
            '</div>';
        return;
    }

    contacts.forEach(function (contact) {
        const card = document.createElement("div");
        card.className = "sos-dispatch-card";

        const info = document.createElement("div");
        info.className = "sos-dispatch-info";

        const avatar = document.createElement("div");
        avatar.className = "sos-dispatch-avatar";
        const initial = (contact.name && contact.name.trim().length > 0)
            ? contact.name.trim().charAt(0).toUpperCase()
            : "👤";
        avatar.textContent = initial;

        const details = document.createElement("div");
        details.className = "sos-dispatch-details";

        const heading = document.createElement("h4");
        heading.textContent = contact.name;

        const sub = document.createElement("p");
        const relTag = document.createElement("span");
        relTag.className = "relation-tag";
        relTag.textContent = contact.relation || "Contact";

        const phoneSpan = document.createElement("span");
        phoneSpan.textContent = "📞 " + contact.phone;

        sub.appendChild(relTag);
        sub.appendChild(phoneSpan);

        details.appendChild(heading);
        details.appendChild(sub);

        info.appendChild(avatar);
        info.appendChild(details);

        // Actions: Call, WhatsApp, SMS
        const actions = document.createElement("div");
        actions.className = "sos-dispatch-actions";

        // 1. Call Button
        const callBtn = document.createElement("button");
        callBtn.type = "button";
        callBtn.className = "sos-action-btn btn-call";
        callBtn.innerHTML = "<span>📞</span> Call";
        callBtn.title = "Call " + contact.name;
        callBtn.addEventListener("click", function () {
            triggerCall(contact.phone, contact.name);
        });

        // 2. WhatsApp Button
        const waBtn = document.createElement("button");
        waBtn.type = "button";
        waBtn.className = "sos-action-btn btn-wa";
        waBtn.innerHTML = "<span>💬</span> WhatsApp";
        waBtn.title = "Send WhatsApp emergency alert to " + contact.name;
        waBtn.addEventListener("click", function () {
            triggerWhatsApp(contact.phone, contact.name);
        });

        // 3. SMS Button
        const smsBtn = document.createElement("button");
        smsBtn.type = "button";
        smsBtn.className = "sos-action-btn btn-sms";
        smsBtn.innerHTML = "<span>📱</span> SMS";
        smsBtn.title = "Send SMS emergency alert to " + contact.name;
        smsBtn.addEventListener("click", function () {
            triggerSMS(contact.phone, contact.name);
        });

        actions.appendChild(callBtn);
        actions.appendChild(waBtn);
        actions.appendChild(smsBtn);

        card.appendChild(info);
        card.appendChild(actions);

        listContainer.appendChild(card);
    });
}

// ==========================================================================
// 5. DASHBOARD: TRUSTED CONTACTS MANAGEMENT
// ==========================================================================

const contactForm = document.getElementById("contact-form");
const contactList = document.getElementById("contact-list");

/**
 * Creates modern dashboard contact card with Call, WhatsApp, SMS and Delete actions.
 */
function createContactCard(contact) {
    const contactCard = document.createElement("div");
    contactCard.className = "contact-card";

    const meta = document.createElement("div");
    meta.className = "contact-meta";

    const avatar = document.createElement("div");
    avatar.className = "contact-avatar";
    const initial = (contact.name && contact.name.trim().length > 0)
        ? contact.name.trim().charAt(0).toUpperCase()
        : "👤";
    avatar.textContent = initial;

    const details = document.createElement("div");
    details.className = "contact-details";

    const heading = document.createElement("h3");
    heading.textContent = contact.name;

    const info = document.createElement("p");
    const relationTag = document.createElement("span");
    relationTag.className = "relation-tag";
    relationTag.textContent = contact.relation;

    const phoneLink = document.createElement("span");
    phoneLink.textContent = "📞 " + contact.phone;

    info.appendChild(relationTag);
    info.appendChild(document.createTextNode(" "));
    info.appendChild(phoneLink);

    details.appendChild(heading);
    details.appendChild(info);

    meta.appendChild(avatar);
    meta.appendChild(details);

    // Dashboard Contact Actions Cluster
    const actionsContainer = document.createElement("div");
    actionsContainer.className = "contact-actions";

    // Quick Call
    const callBtn = document.createElement("button");
    callBtn.type = "button";
    callBtn.className = "btn-contact-action call";
    callBtn.innerHTML = "<span>📞</span> Call";
    callBtn.addEventListener("click", function () {
        triggerCall(contact.phone, contact.name);
    });

    // Quick WhatsApp
    const waBtn = document.createElement("button");
    waBtn.type = "button";
    waBtn.className = "btn-contact-action wa";
    waBtn.innerHTML = "<span>💬</span> WhatsApp";
    waBtn.addEventListener("click", function () {
        triggerWhatsApp(contact.phone, contact.name);
    });

    // Quick SMS
    const smsBtn = document.createElement("button");
    smsBtn.type = "button";
    smsBtn.className = "btn-contact-action sms";
    smsBtn.innerHTML = "<span>📱</span> SMS";
    smsBtn.addEventListener("click", function () {
        triggerSMS(contact.phone, contact.name);
    });

    // Delete Button
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn-delete-contact";
    deleteButton.innerHTML = "<span>🗑️</span> Delete";

    deleteButton.addEventListener("click", async function () {
        const confirmed = confirm("Are you sure you want to remove " + contact.name + " from trusted contacts?");
        if (!confirmed) return;

        try {
            const response = await fetch("/api/contacts/delete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    phone: contact.phone
                })
            });

            const result = await response.json();

            if (!response.ok) {
                alert(result.error || "Could not delete contact.");
                return;
            }

            alert("Contact removed successfully.");
            loadSavedContacts();
        } catch (error) {
            alert("Cannot connect to Flask server.");
            console.error("Delete error:", error);
        }
    });

    actionsContainer.appendChild(callBtn);
    actionsContainer.appendChild(waBtn);
    actionsContainer.appendChild(smsBtn);
    actionsContainer.appendChild(deleteButton);

    contactCard.appendChild(meta);
    contactCard.appendChild(actionsContainer);
    return contactCard;
}

/**
 * Loads contacts from MongoDB and populates both dashboard and cached state.
 */
async function loadSavedContacts() {
    if (!contactList) return;

    try {
        const response = await fetch("/api/contacts");
        const contacts = await response.json();

        if (!response.ok) {
            contactList.innerHTML = '<div class="empty-state">Could not load saved contacts from server.</div>';
            return;
        }

        contactList.innerHTML = "";

        if (!Array.isArray(contacts) || contacts.length === 0) {
            cachedTrustedContacts = [];
            contactList.innerHTML = '<div class="empty-state">🛡️ No trusted contacts registered yet. Add family or friends above.</div>';
            return;
        }

        cachedTrustedContacts = contacts;

        contacts.forEach(function (contact) {
            const contactCard = createContactCard(contact);
            contactList.appendChild(contactCard);
        });

    } catch (error) {
        console.error("Error loading contacts:", error);
        contactList.innerHTML = '<div class="empty-state">Unable to connect to backend server.</div>';
    }
}

// Add new trusted contact form submission
if (contactForm) {
    contactForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const nameInput = document.getElementById("contact-name");
        const phoneInput = document.getElementById("contact-phone");
        const relationInput = document.getElementById("contact-relation");

        const name = nameInput ? nameInput.value.trim() : "";
        const phone = phoneInput ? phoneInput.value.trim() : "";
        const relation = relationInput ? relationInput.value : "";

        if (!name || !phone || !relation) {
            alert("Please fill all contact details.");
            return;
        }

        // Validate minimum phone digits
        const cleanDigits = phone.replace(/\D/g, "");
        if (cleanDigits.length < 5) {
            alert("Please enter a valid phone number with at least 5 digits.");
            return;
        }

        try {
            const response = await fetch("/api/contacts", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name: name,
                    phone: phone,
                    relation: relation
                })
            });

            const result = await response.json();

            if (!response.ok) {
                alert(result.error || "Could not save contact.");
                return;
            }

            alert("Trusted contact saved successfully!");
            contactForm.reset();
            loadSavedContacts();

        } catch (error) {
            alert("Cannot connect to Flask server. Please check your backend.");
            console.error("Save contact error:", error);
        }
    });
}

// Load contacts on startup
loadSavedContacts();

// ==========================================================================
// 6. LOCATION SHARING RADAR
// ==========================================================================

function getLocation() {
    const locationText = document.getElementById("user-location");
    const alertBox = document.getElementById("emergency-alert");

    if (!navigator.geolocation) {
        if (locationText) {
            locationText.textContent = "Location is not supported by this browser.";
        }
        return;
    }

    if (locationText) {
        locationText.textContent = "Acquiring GPS coordinates...";
    }

    navigator.geolocation.getCurrentPosition(
        function (position) {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            const mapLink = "https://www.google.com/maps?q=" + latitude + "," + longitude;

            currentSOSLocation = {
                latitude: latitude,
                longitude: longitude,
                mapsUrl: mapLink,
                acquired: true,
                error: null
            };

            if (locationText) {
                locationText.innerHTML = "<strong>📍 Location:</strong> Latitude: " + latitude.toFixed(6) + " | Longitude: " + longitude.toFixed(6);
            }

            if (alertBox) {
                alertBox.innerHTML = "";
                const link = document.createElement("a");
                link.href = mapLink;
                link.target = "_blank";
                link.rel = "noopener";
                link.innerHTML = "<span>🗺️</span> View My Location on Google Maps";
                alertBox.appendChild(link);
            }
        },
        function (error) {
            if (locationText) {
                locationText.textContent = "Unable to get location. Please allow location permissions.";
            }
            alert("Location permission denied or unavailable.");
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}

// ==========================================================================
// 7. EMERGENCY ALERT COMPOSER
// ==========================================================================

async function prepareEmergencyAlert() {
    const locationElem = document.getElementById("user-location");
    const locationText = locationElem ? locationElem.textContent : "";
    const preview = document.getElementById("alert-preview");

    if (!locationText || !locationText.includes("Latitude:")) {
        alert("Please capture your location first by clicking 'Share My Location' or 'SOS EMERGENCY'.");
        return;
    }

    try {
        const response = await fetch("/api/contacts");
        const contacts = await response.json();

        if (!response.ok) {
            alert("Could not load trusted contacts from database.");
            return;
        }

        if (!Array.isArray(contacts) || contacts.length === 0) {
            alert("Please add at least one trusted contact before preparing the emergency alert.");
            return;
        }

        const latMatch = locationText.match(/Latitude:\s*([\d.-]+)/);
        const lonMatch = locationText.match(/Longitude:\s*([\d.-]+)/);

        if (!latMatch || !lonMatch) {
            alert("Could not detect coordinates. Please get your location again.");
            return;
        }

        const mapsUrl = "https://www.google.com/maps?q=" + latMatch[1] + "," + lonMatch[1];
        const message = generateEmergencyMessage(mapsUrl);

        if (preview) {
            preview.innerHTML = "";

            const heading = document.createElement("h3");
            heading.innerHTML = "<span>🚨</span> Emergency Alert Preview";

            const messageBox = document.createElement("p");
            messageBox.textContent = message;
            messageBox.style.whiteSpace = "pre-line";

            const contactHeading = document.createElement("h4");
            contactHeading.innerHTML = "<span>👥</span> Dispatch Recipients (" + contacts.length + " Contacts)";

            preview.appendChild(heading);
            preview.appendChild(messageBox);
            preview.appendChild(contactHeading);

            contacts.forEach(function (contact) {
                const contactItem = document.createElement("p");
                contactItem.textContent = "• " + contact.name + " (" + contact.relation + ") - " + contact.phone;
                preview.appendChild(contactItem);
            });
        }

        alert("Emergency alert preview prepared successfully! Use the buttons below to copy or share.");

    } catch (error) {
        alert("Could not prepare emergency alert.");
        console.error("Alert preview error:", error);
    }
}

// Copy Emergency Alert to Clipboard
async function copyEmergencyAlert() {
    const preview = document.getElementById("alert-preview");

    if (!preview || !preview.innerText.trim()) {
        alert("Please click 'Prepare Emergency Alert' first.");
        return;
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(preview.innerText);
        } else {
            const tempArea = document.createElement("textarea");
            tempArea.value = preview.innerText;
            document.body.appendChild(tempArea);
            tempArea.select();
            document.execCommand("copy");
            document.body.removeChild(tempArea);
        }

        alert("Emergency message copied to clipboard! You can paste and send it immediately.");
    } catch (error) {
        alert("Could not copy message automatically. Please select and copy from the preview.");
        console.error("Copy error:", error);
    }
}

// Share Emergency Alert via Web Share API
async function shareEmergencyAlert() {
    const preview = document.getElementById("alert-preview");

    if (!preview || !preview.innerText.trim()) {
        alert("Please click 'Prepare Emergency Alert' first.");
        return;
    }

    const message = preview.innerText;

    try {
        if (navigator.share) {
            await navigator.share({
                title: "SAFEGUARD 360 Emergency Alert",
                text: message
            });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(message);
            alert("Web Share is not supported on this browser. Message copied to clipboard instead!");
        } else {
            const tempArea = document.createElement("textarea");
            tempArea.value = message;
            document.body.appendChild(tempArea);
            tempArea.select();
            document.execCommand("copy");
            document.body.removeChild(tempArea);
            alert("Message copied to clipboard!");
        }
    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Sharing error:", error);
            alert("Could not share emergency message.");
        }
    }
}

// General WhatsApp Sharing (from Action Hub)
function shareWhatsApp() {
    const preview = document.getElementById("alert-preview");
    let text = preview ? preview.innerText.trim() : "";

    if (!text) {
        const locationElem = document.getElementById("user-location");
        const locationText = locationElem ? locationElem.textContent : "";
        if (locationText && locationText.includes("Latitude:")) {
            prepareEmergencyAlert().then(function () {
                const updated = document.getElementById("alert-preview");
                if (updated && updated.innerText.trim()) {
                    const waUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(updated.innerText.trim());
                    window.open(waUrl, "_blank");
                }
            });
            return;
        } else {
            alert("Please share your location and click 'Prepare Emergency Alert' first!");
            return;
        }
    }

    const waUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(text);
    window.open(waUrl, "_blank");
}

// ==========================================================================
// 8. EMERGENCY INCIDENT REPORTING
// ==========================================================================

const incidentForm = document.getElementById("incident-form");

if (incidentForm) {
    incidentForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const typeInput = document.getElementById("incident-type");
        const descInput = document.getElementById("incident-description");
        const locInput = document.getElementById("incident-location");
        const message = document.getElementById("incident-message");

        const incidentType = typeInput ? typeInput.value : "";
        const description = descInput ? descInput.value.trim() : "";
        const location = locInput ? locInput.value.trim() : "";

        if (!incidentType || !description) {
            alert("Please fill in all required incident fields.");
            return;
        }

        try {
            const response = await fetch("/api/incidents", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    incident_type: incidentType,
                    description: description,
                    location: location
                })
            });

            const result = await response.json();

            if (!response.ok) {
                alert(result.error || "Could not submit report.");
                return;
            }

            if (message) {
                message.innerHTML = "✅ <strong>Report Logged!</strong> Incident recorded in central database.";
                message.style.color = "var(--green-500)";
            }

            alert("Emergency incident report has been securely saved to the database!");
            incidentForm.reset();
            loadIncidentHistory();

        } catch (error) {
            if (message) {
                message.textContent = "Could not connect to backend server.";
                message.style.color = "var(--red-500)";
            }
            console.error("Incident report error:", error);
        }
    });
}

// ==========================================================================
// 9. INCIDENT HISTORY RETRIEVAL
// ==========================================================================

async function loadIncidentHistory() {
    const historyList = document.getElementById("incident-history-list");
    if (!historyList) return;

    historyList.innerHTML = '<div class="empty-state">Loading incident reports from database...</div>';

    try {
        const response = await fetch("/api/incidents");
        const incidents = await response.json();

        if (!response.ok) {
            historyList.innerHTML = '<div class="empty-state">Could not load incident history from database.</div>';
            return;
        }

        historyList.innerHTML = "";

        if (!Array.isArray(incidents) || incidents.length === 0) {
            historyList.innerHTML = '<div class="empty-state">📋 No incident reports found. Submit a new report above to log an event.</div>';
            return;
        }

        incidents.forEach(function (incident) {
            const card = document.createElement("div");
            card.className = "incident-card";

            const top = document.createElement("div");
            top.className = "incident-card-top";

            const badge = document.createElement("span");
            badge.className = "incident-badge";
            badge.textContent = "⚠️ " + incident.incident_type;

            const timestamp = document.createElement("span");
            timestamp.className = "incident-timestamp";
            timestamp.textContent = "🕒 " + (incident.reported_at || "Recent");

            top.appendChild(badge);
            top.appendChild(timestamp);

            const desc = document.createElement("p");
            desc.className = "incident-desc";
            desc.textContent = incident.description;

            const loc = document.createElement("div");
            loc.className = "incident-location-tag";
            loc.textContent = "📍 " + (incident.location || "Location not specified");

            card.appendChild(top);
            card.appendChild(desc);
            card.appendChild(loc);

            historyList.appendChild(card);
        });

    } catch (error) {
        historyList.innerHTML = '<div class="empty-state">Could not connect to backend server.</div>';
        console.error("Load history error:", error);
    }
}

// Load incident history on startup
loadIncidentHistory();
