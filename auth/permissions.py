from functools import wraps
from flask import redirect, url_for
from flask_login import current_user

# Admin required - only allows admin users
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.get_role() != "admin":
            print("You do not have permission to access this page.")
            return redirect(url_for("main.home"))  # Redirect to a safe page
        return f(*args, **kwargs)
    return decorated_function

# User required - allows users, mods, and admins
def user_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            print("You must be logged in to access this page.")
            return redirect(url_for("auth.login"))
        return f(*args, **kwargs)
    return decorated_function
