import os
import json
import firebase_admin
from firebase_admin import credentials, firestore

_db = None


def get_db():
    global _db
    if _db is None:
        service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT", "")
        if service_account_json:
            cred = credentials.Certificate(json.loads(service_account_json))
        else:
            key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
            if not key_path:
                raise RuntimeError(
                    "Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS"
                )
            cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
        _db = firestore.client()
    return _db
