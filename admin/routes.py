import json
import os
from flask import render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user
from werkzeug.security import generate_password_hash

from auth.permissions import admin_required
from auth.utils import get_user_file, save_user, load_user
from . import admin_blueprint
from config import SITE_NAME, USERS_FOLDER_PATH

# Admin page for managing users
@admin_blueprint.route("/admin")
@login_required
@admin_required
def admin():
    users = []
    for filename in os.listdir(USERS_FOLDER_PATH):
        if filename.endswith(".json"):
            user_file = os.path.join(USERS_FOLDER_PATH, filename)
            try:
                with open(user_file, "r") as file:
                    user_data = json.load(file)
                    username = user_data.get("username")
                    role = user_data.get("role", "user")  # Default role is "user" if not found
                    users.append({"username": username, "role": role})
            except Exception as e:
                print(f"Error loading user data from {user_file}: {e}")

    return render_template("admin.html", site_name=SITE_NAME, users=users)


@admin_blueprint.route("/admin/add", methods=["GET", "POST"])
@login_required
@admin_required
def add_user():
    if request.method == "POST":
        username = request.form.get("username").lower()  # Convert username to lowercase
        password = request.form.get("password")
        role = request.form.get("role")

        # Validate form data
        if not username or not password or not role:
            return redirect(url_for("admin.add_user"))

        if os.path.exists(get_user_file(username)):
            flash(f"User {username} already exists.", "danger")
            return redirect(url_for("admin.add_user"))

        # Hash the password and add the new user
        users = {
            "username": username,
            "password": generate_password_hash(password),
            "role": role
        }

        save_user(users)

        print(f"User {username} has been added successfully.")
        return redirect(url_for("admin.admin"))

    return render_template("add_user.html", site_name=SITE_NAME)

@admin_blueprint.route("/admin/edit_user/<username>", methods=["GET", "POST"])
@login_required
@admin_required
def edit_user(username):
    username = username.lower()  # Normalize case sensitivity

    # Ensure the user exists
    user_file = get_user_file(username)
    if not os.path.exists(user_file):
        print(f"User '{username}' does not exist.")
        return redirect(url_for('admin.admin'))

    user_data = load_user(username)

    if request.method == "POST":
        new_username = request.form["username"].strip().lower()
        new_password = request.form["password"].strip()
        confirm_password = request.form["confirm_password"].strip()
        new_role = request.form["role"]

        # If the user is an admin, don't allow changing the username
        if username == "admin" and new_username != username:
            flash("The admin username cannot be changed.", "danger")
            return redirect(url_for('admin.edit_user', username=username))

        # Check if new username already exists (excluding the current user)
        if new_username != username and os.path.exists(get_user_file(new_username)):
            print(f"Username '{new_username}' is already taken.")
            flash("Username already exists. Please choose a different one.", "danger")
            return redirect(url_for('admin.edit_user', username=username))

        # Validate password only if provided
        if new_password or confirm_password:
            if new_password != confirm_password:
                print("Passwords do not match.")
                flash("Passwords do not match.", "danger")
                return redirect(url_for('admin.edit_user', username=username))
            # Update password
            user_data["password"] = generate_password_hash(new_password)

        # Update username if it changed and is not an admin
        if new_username != username and username != "admin":
            # Remove the old username's file
            os.remove(get_user_file(username))
            user_data["username"] = new_username  # Update the username field

        # Update user role
        user_data["role"] = new_role

        # Save updated user data
        save_user(user_data)

        # If the username changed, rename the file
        if new_username != username and username != "admin":
            new_user_file = get_user_file(new_username)

        print(f"User '{new_username}' has been updated successfully.")
        return redirect(url_for('admin.admin'))

    # Render the edit form with current user data
    return render_template(
        "edit_user.html",
        site_name=SITE_NAME,
        username=username,
        role=user_data["role"],
        password_hint="********"  # Placeholder for password
    )


@admin_blueprint.route("/admin/confirm_delete/<username>", methods=["GET", "POST"])
@login_required
@admin_required
def confirm_delete_user(username):
    username = username.lower()  # Convert username to lowercase

    user = get_user_file(username)

    if username == current_user.username.lower():  # Ensure logged-in user doesn't delete their own account
        print("You cannot delete your own account.")
        return redirect(url_for('admin.admin'))

    if not os.path.exists(user):
        print(f"User '{username}' does not exist.")
        return redirect(url_for('admin.admin'))

    # If the form is submitted, delete the user
    if request.method == "POST":
        if os.path.exists(user):
            os.remove(user)
            print(f"User '{username}' has been deleted successfully.")
        else:
            print(f"User '{username}' does not exist.")
        return redirect(url_for('admin.admin'))

    return render_template("confirm_delete_user.html", site_name=SITE_NAME, username=username)
