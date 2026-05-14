from flask import render_template, redirect, url_for, request
from flask_login import login_user, logout_user, login_required
from werkzeug.security import check_password_hash
from . import auth_blueprint
from models import User
from config import SITE_NAME
from auth.utils import load_user


# Login route
@auth_blueprint.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"].lower()  # Convert input to lowercase
        password = request.form["password"]

        # Load the user's data
        user_data = load_user(username)

        if user_data:
            # Check if the password matches the stored hash
            if check_password_hash(user_data["password"], password):
                user = User(username)
                login_user(user)
                print("Logged in successfully!")
                return redirect(url_for("main.home"))
            else:
                print("Invalid password")
        else:
            print("Invalid username or user not found")

    # If the method is GET or login failed, render the login page
    return render_template("login.html", site_name=SITE_NAME)


# Logout route
@auth_blueprint.route("/logout")
@login_required
def logout():
    logout_user()
    print("You have been logged out.")
    return redirect(url_for("auth.login"))
