import json
import os

from flask import render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user, logout_user
from werkzeug.security import generate_password_hash

from auth.utils import load_user, save_user, get_user_file
from . import profile_blueprint

from config import SITE_NAME


@profile_blueprint.route("/profile")
@login_required
def profile():
    """
    Display the profile page for the currently logged-in user.
    """
    username = current_user.username  # Get the logged-in user's username
    user_data = load_user(username)  # Load user data from the utility function
    role = user_data.get("role", "user")  # Default to "user" if no role is found
    return render_template("profile.html", username=username, role=role, site_name=SITE_NAME)


@profile_blueprint.route("/edit-profile", methods=["GET", "POST"])
@login_required
def edit_profile():
    """
    Allow the logged-in user to edit their profile, including changing their username and password.
    Handles file renaming if the username is changed.
    """
    try:
        if request.method == "POST":
            new_username = request.form["username"].strip()
            new_password = request.form["password"].strip()
            confirm_password = request.form["confirm_password"].strip()

            # Validate password match
            if new_password != confirm_password:
                flash("Passwords do not match.", "danger")
                return redirect(url_for("profile.edit_profile"))

            # Load the current user's data
            user_data = load_user(current_user.username)
            if not user_data:
                flash("User data not found. Please contact support.", "danger")
                return redirect(url_for("profile.edit_profile"))

            # Check if the user is an admin and prevent username change
            if current_user.username == "admin" and new_username != current_user.username:
                flash("Admins cannot change their username.", "danger")
                return redirect(url_for("profile.edit_profile"))

            # Check if the new username is already taken by another user (if it's not admin)
            if new_username != current_user.username and current_user.username != "admin":
                new_user_file = get_user_file(new_username)
                if os.path.exists(new_user_file):
                    flash("Username already exists. Please choose a different one.", "danger")
                    return render_template("edit_profile.html", site_name=SITE_NAME)

            # Update user data
            old_username = current_user.username
            user_data["password"] = generate_password_hash(new_password)  # Update password

            # Update username if it's not admin and the username is different
            if new_username != "admin" and new_username != current_user.username:
                user_data["username"] = new_username  # Update username

            # Save updated user data
            save_user(user_data)

            # Rename the JSON file if the username changes (and is not admin)
            if new_username != old_username and old_username != "admin":
                old_user_file = get_user_file(old_username)
                os.remove(old_user_file)  # Rename file

            # Update the session for the current user
            current_user.username = new_username

            flash("Profile updated successfully!", "success")
            return redirect(url_for("profile.profile"))

        return render_template("edit_profile.html", site_name=SITE_NAME)

    except Exception as e:
        print(f"Unexpected error occurred: {e}")
        flash("An unexpected error occurred. Please try again later.", "danger")
        return redirect(url_for("profile.profile"))
