from threading import Thread

from flask import Flask
from flask_login import LoginManager
from config import SECRET_KEY
from auth import auth_blueprint
from main import main_blueprint
from profile import profile_blueprint
from admin import admin_blueprint
from file_manager import file_manager_blueprint
from models import User
from auth.routes import load_user
from series_downloader.series_downloader import start_background_task

start_background_task()

app = Flask(__name__)
app.secret_key = SECRET_KEY

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "auth.login"


# User loader function
@login_manager.user_loader
def manager_load_user(username):
    try:
        # Load user data directly for the given username
        user_data = load_user(username)

        if user_data:
            # Extract the role or default to "user" if not specified
            role = user_data.get("role", "username")
            return User(username, role)  # Assuming User class takes username and role
        else:
            print(f"User '{username}' not found.")
            return None
    except Exception as e:
        print(f"Error loading user '{username}': {e}")
        return None




# Register blueprints
app.register_blueprint(auth_blueprint)
app.register_blueprint(admin_blueprint)
app.register_blueprint(profile_blueprint)
app.register_blueprint(main_blueprint)
app.register_blueprint(file_manager_blueprint)


if __name__ == "__main__":
    # start_background_task()
    app.run(debug=True, host='0.0.0.0', port=7080)
