import json
import os
from config import USERS_FOLDER_PATH
from werkzeug.security import generate_password_hash


def load_user(user):
    """
    Load user data from a JSON file.
    If the users folder or default user does not exist, create them.
    """
    # Ensure the users folder exists
    if not os.path.exists(USERS_FOLDER_PATH):
        os.mkdir(USERS_FOLDER_PATH)

    # Check if the default admin user exists
    if not os.path.exists(get_user_file("admin")):
        create_default_user()  # Create default users if the file doesn't exist

    user_file = get_user_file(user)

    # Attempt to load the user file
    try:
        if os.path.exists(user_file):
            with open(user_file, "r") as file:
                return json.load(file)
        else:
            print(f"User {user} does not exist.")
            return None
    except json.JSONDecodeError:
        print(f"Error decoding JSON in {user_file}. Returning empty data.")
        return {}
    except Exception as e:
        print(f"Error loading user from {user_file}: {e}")
        return {}


def save_user(user_data):
    """
    Save a single user's data to their respective JSON file.
    """
    user_file = get_user_file(user_data["username"])

    try:
        with open(user_file, "w") as file:
            json.dump(user_data, file, indent=4)
        # print(f"Saved/Updated User: {user_data["username"]}")
    except Exception as e:
        print(f"Error saving user data to {user_file}: {e}")


def get_user_file(user):
    """
    Construct the path to the JSON file for a specific user.
    """
    return os.path.join(USERS_FOLDER_PATH, f"{user}.json")


def create_default_user():
    """
    Create a default admin user if it does not exist.
    """
    admin = {
        "username": "admin",
        "password": generate_password_hash("comicorbit"),
        "role": "admin"
    }
    save_user(admin)
