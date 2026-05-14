from flask_login import UserMixin
from auth.utils import load_user  # Import load_users here, not inside methods

class User(UserMixin):
    def __init__(self, username, role=None):
        self.username = username
        self.role = role or self.get_user_role(username)  # Use get_user_role if role not provided

    def get_role(self):
        return self.role

    def get_user_role(self, username):
        users = load_user(username)  # Assuming load_users loads a dictionary of users
        return users.get(username, {}).get("role", "user")  # Default to 'user'

    def get_id(self):
        return self.username  # Flask-Login needs this to get the unique identifier
