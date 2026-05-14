import re
import zipfile
from datetime import datetime, timedelta

from flask import render_template, abort, url_for, send_from_directory, Response
from flask_login import login_required
import os
from natsort import natsorted

import download_list_manager
from config import SITE_NAME, MANGA_DIRECTORY, COMICS_DIRECTORY
from . import main_blueprint


@main_blueprint.route('/cover_images/<path:folder>/<filename>')
@login_required
def serve_cover_image(folder, filename):
    """Serve cover images from the comics or manga directories."""
    base_directories = [COMICS_DIRECTORY, MANGA_DIRECTORY]
    for base_dir in base_directories:
        safe_path = os.path.abspath(os.path.join(base_dir, folder, filename))
        if os.path.exists(safe_path):
            return send_from_directory(os.path.join(base_dir, folder), filename)
    abort(404, description="Cover image not found.")


@main_blueprint.route("/")
@login_required
def home():
    """Display all manga and comic series on the home page without chapters."""
    try:
        series_data = []
        recently_added = []  # This will store series added within the last week
        download_list = download_list_manager.load_download_list()

        # Get the current date and time
        current_date = datetime.now()

        for entry in download_list:
            series_name = entry["series_name"]
            folder_type = entry["folder_type"]
            date_added_str = entry["date_added"]
            date_added = datetime.strptime(date_added_str, "%Y-%m-%d")  # Convert date_added to datetime

            # Determine directory and cover image filename
            directory = COMICS_DIRECTORY if folder_type == "comic" else MANGA_DIRECTORY
            cover_filename = f"cover_image.jpg"
            series_name = re.sub(r'[<>:"/\\|?*]', ' -', series_name)
            cover_path = os.path.join(directory, series_name, cover_filename)

            # Set cover art URL
            if os.path.exists(cover_path):
                cover_art_url = url_for('main.serve_cover_image', folder=series_name, filename=cover_filename)
            else:
                cover_art_url = url_for('static', filename='default.png')

            # Add the series to the full list
            series_data.append({
                "name": series_name,
                "type": folder_type,
                "cover_art": cover_art_url,
                "date_added": date_added_str,  # Include the date_added in the series data
            })

            # Check if the series is added within the last week and add it to the "recently_added" list
            if current_date - date_added <= timedelta(weeks=1):
                recently_added.append({
                    "name": series_name,
                    "type": folder_type,
                    "cover_art": cover_art_url,
                    "date_added": date_added_str,
                })

        return render_template("index.html", site_name=SITE_NAME, series_data=series_data, recently_added=recently_added)

    except Exception as e:
        abort(500, description=f"Error loading series: {e}")

    except Exception as e:
        abort(500, description=f"Error loading series: {e}")

    except Exception as e:
        abort(500, description=f"Error loading series: {e}")


@main_blueprint.route("/series/<folder_type>/<series>")
@login_required
def series(folder_type, series):
    """Display a specific series and its chapters."""
    try:
        download_list = download_list_manager.load_download_list()

        for item in download_list:
            if item['series_name'] == series:
                series_path = item.get('series_folder', None)
                cover_art_path = item.get('poster_path', None)
                description = item.get('description', None)

        if not os.path.exists(series_path):
            abort(404, description="Series not found.")

        chapters = natsorted([f for f in os.listdir(series_path) if f.endswith(".cbz")])
        print(chapters)
        cover_filename = f"cover_image.jpg"

        cover_art_url = (
            url_for('main.serve_cover_image', folder=series, filename=cover_filename)
            if os.path.exists(cover_art_path)
            else url_for('static', filename='default.png')
        )

        return render_template("series.html", site_name=SITE_NAME, series_data={
            "name": series,
            "type": folder_type,
            "cover_art": cover_art_url,
            "chapters": chapters,
            "description": description
        })

    except Exception as e:
        abort(500, description=f"Error loading series: {e}")


@main_blueprint.route("/read/<folder_type>/<series>/<chapter>/<int:current_page>")
@login_required
def read(folder_type, series, chapter, current_page):
    """Display a single page of a manga or comic chapter and allow navigation between chapters and pages."""

    # Assuming `chapter` contains the full filename, extract the chapter number or handle errors
    chapter_number = extract_chapter_number(chapter)

    # If chapter_number is not a valid number, handle the error or redirect
    if chapter_number is None:
        return "Invalid chapter format", 400  # or redirect to a valid page

    directory = MANGA_DIRECTORY if folder_type == "manga" else COMICS_DIRECTORY
    comic_path = os.path.join(directory, series, chapter)
    print(comic_path)

    images_in_memory = []

    if os.path.exists(comic_path):
        with zipfile.ZipFile(comic_path, 'r') as zip_ref:
            # Extract all image files (commonly png, jpg, jpeg)
            image_files = [file for file in zip_ref.namelist() if file.lower().endswith(('.png', '.jpg', '.jpeg'))]
            image_files = sorted(image_files)  # Sort for page order

            # Load images into memory
            for image_file in image_files:
                with zip_ref.open(image_file) as img_file:
                    img_data = img_file.read()
                    images_in_memory.append(img_data)

        total_pages = len(images_in_memory)

        # Ensure the current page is within bounds
        if current_page < 1 or current_page > total_pages:
            return "Page not found", 404

        current_image_data = images_in_memory[current_page - 1]

        # Get total number of chapters and calculate next/previous chapter URLs
        total_chapters_count = total_chapters(series, folder_type)
        next_chapter_url = url_for('main.read', folder_type=folder_type, series=series, chapter=str(chapter_number + 1), current_page=1) if chapter_number < total_chapters_count else None
        previous_chapter_url = url_for('main.read', folder_type=folder_type, series=series, chapter=str(chapter_number - 1), current_page=1) if chapter_number > 1 else None

        return render_template(
            "read.html",
            site_name="Your Site Name",
            folder_type=folder_type,
            series=series,
            chapter=chapter_number,
            current_page=current_page,
            total_pages=total_pages,
            image_data=current_image_data,
            next_chapter_url=next_chapter_url,
            previous_chapter_url=previous_chapter_url
        )

    return "Comic chapter not found", 404


def extract_chapter_number(chapter_filename):
    """Extract chapter number from a given chapter filename."""
    match = re.search(r'(\d+)', chapter_filename)
    if match:
        return int(match.group(1))
    return None



def total_chapters(series, folder_type):
    """Returns the total number of chapters for a given series, depending on folder type."""

    # Determine the correct directory based on folder type
    directory = MANGA_DIRECTORY if folder_type == "manga" else COMICS_DIRECTORY
    series_folder = os.path.join(directory, series)  # Adjust this path based on your structure

    if not os.path.exists(series_folder):
        return 0  # If the directory doesn't exist, return 0 chapters

    # List all .cbz files (or directories, depending on how chapters are stored)
    chapters = [f for f in os.listdir(series_folder) if f.lower().endswith('.cbz')]  # Looking for .cbz files

    return len(chapters)




# Route to serve the image of the current page
@main_blueprint.route('/read_image/<folder_type>/<series>/<chapter>/<int:current_page>')
def read_image(folder_type, series, chapter, current_page):
    """Serve the image data for a specific page of the comic/manga chapter."""

    directory = MANGA_DIRECTORY if folder_type == "manga" else COMICS_DIRECTORY
    comic_path = os.path.join(directory, series, chapter)

    images_in_memory = []

    if os.path.exists(comic_path):
        with zipfile.ZipFile(comic_path, 'r') as zip_ref:
            # Extract all image files (commonly png, jpg, jpeg)
            image_files = [file for file in zip_ref.namelist() if file.lower().endswith(('.png', '.jpg', '.jpeg'))]
            image_files = sorted(image_files)  # Sort for page order

            # Load images into memory
            for image_file in image_files:
                with zip_ref.open(image_file) as img_file:
                    img_data = img_file.read()
                    images_in_memory.append(img_data)

        total_pages = len(images_in_memory)

        if current_page < 1 or current_page > total_pages:
            return "Page not found", 404

        current_image_data = images_in_memory[current_page - 1]

        # Return the image as a response
        return Response(current_image_data, content_type='image/jpeg')  # or 'image/png', depending on the format

    return "Comic chapter not found", 404
