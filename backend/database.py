
from pymongo import MongoClient
from datetime import datetime

# Connect to local MongoDB
client = MongoClient("mongodb://localhost:27017/", serverSelectionTimeoutMS=5000)

# Select database
db = client["SAFEGUARD360"]

# Collections
contacts_collection = db["trusted_contacts"]
incidents_collection = db["incidents"]


# TRUSTED CONTACTS

def save_contact(contact):
    existing_contact = contacts_collection.find_one({
        "phone": str(contact.get("phone", "")).strip()
    })

    if existing_contact:
        return None

    # Copy dictionary so caller's object is not mutated with non-serializable ObjectId
    doc = dict(contact)
    result = contacts_collection.insert_one(doc)
    return str(result.inserted_id)


def get_contacts():
    return list(contacts_collection.find({}, {"_id": 0}))


def delete_contact(phone):
    result = contacts_collection.delete_one({"phone": str(phone).strip()})
    return result.deleted_count


# EMERGENCY INCIDENT REPORTS

def save_incident(incident):
    doc = dict(incident)
    doc["reported_at"] = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    result = incidents_collection.insert_one(doc)
    return str(result.inserted_id)


def get_incidents():
    incidents = list(
        incidents_collection.find({}, {"_id": 0}).sort("_id", -1)
    )
    return incidents
