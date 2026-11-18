
from flask import Flask, jsonify, request, send_from_directory
from database import (
    save_contact,
    get_contacts,
    delete_contact,
    save_incident,
    get_incidents
)
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")


@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/womens-safety")
def womens_safety():
    return send_from_directory(FRONTEND_DIR, "womens_safety.html")


@app.route("/child-safety")
def child_safety():
    return send_from_directory(FRONTEND_DIR, "child_safety.html")


@app.route("/personal-safety")
def personal_safety():
    return send_from_directory(FRONTEND_DIR, "personal_safety.html")


# Add trusted contact
@app.route("/api/contacts", methods=["POST"])
def add_contact():

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    relation = str(data.get("relation", "")).strip()

    if not name or not phone or not relation:
        return jsonify({"error": "Please fill all contact details."}), 400

    contact = {
        "name": name,
        "phone": phone,
        "relation": relation
    }

    try:
        contact_id = save_contact(contact)

        if contact_id is None:
            return jsonify({
                "error": "This contact already exists!"
            }), 409

        return jsonify({
            "message": "Contact saved successfully",
            "contact": contact,
            "id": contact_id
        }), 201

    except Exception as error:
        print("MongoDB error:", error)
        return jsonify({"error": "Could not save contact."}), 500


# Get all trusted contacts
@app.route("/api/contacts", methods=["GET"])
def show_contacts():

    try:
        return jsonify(get_contacts())

    except Exception as error:
        print("MongoDB error:", error)
        return jsonify({"error": "Could not retrieve contacts."}), 500


# Delete trusted contact
@app.route("/api/contacts/delete", methods=["POST"])
def remove_contact():

    data = request.get_json(silent=True) or {}
    phone = str(data.get("phone", "")).strip()

    if not phone:
        return jsonify({"error": "Phone number is required."}), 400

    try:
        deleted_count = delete_contact(phone)

        if deleted_count == 0:
            return jsonify({"error": "Contact not found."}), 404

        return jsonify({
            "message": "Contact deleted successfully!"
        }), 200

    except Exception as error:
        print("MongoDB error:", error)
        return jsonify({"error": "Could not delete contact."}), 500


# =====================================
# EMERGENCY INCIDENT REPORTING
# =====================================

@app.route("/api/incidents", methods=["POST"])
def report_incident():

    data = request.get_json(silent=True) or {}

    incident_type = str(data.get("incident_type", "")).strip()
    description = str(data.get("description", "")).strip()
    location = str(data.get("location", "")).strip()

    if not incident_type or not description:
        return jsonify({
            "error": "Please enter incident type and description."
        }), 400

    incident = {
        "incident_type": incident_type,
        "description": description,
        "location": location
    }

    try:
        incident_id = save_incident(incident)

        return jsonify({
            "message": "Incident reported successfully!",
            "id": incident_id
        }), 201

    except Exception as error:
        print("Incident reporting error:", error)
        return jsonify({
            "error": "Could not save incident."
        }), 500


@app.route("/api/incidents", methods=["GET"])
def show_incidents():

    try:
        return jsonify(get_incidents())

    except Exception as error:
        print("Incident retrieval error:", error)
        return jsonify({
            "error": "Could not retrieve incidents."
        }), 500

if __name__ == "__main__":
    app.run(debug=True)
