import os

import json
import re
import shutil
from datetime import datetime

from config import DOWNLOAD_LIST_PATH, COMICS_DIRECTORY, MANGA_DIRECTORY


def validate_download_list():
    try:
        if not os.path.exists(DOWNLOAD_LIST_PATH):
            with open(DOWNLOAD_LIST_PATH, 'w') as config_file:
                json.dump({}, config_file, indent=4)
            return
        else:
            return

    except Exception:
        print("download list error")


# Function to load the config from a JSON file
def load_download_list():
    try:
        validate_download_list()
        with open(DOWNLOAD_LIST_PATH, 'r') as file:
            data = json.load(file)
            # Ensure the returned data is a list
            if isinstance(data, list):
                return data
            else:
                print("Warning: The file is not a list. Returning an empty list.")
                return []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def add_to_download_list(series_name, read_online_link, folder_type, description):
    """Add a series to the download list."""
    modified_series_name, modified_link = modify_series_and_link(series_name, read_online_link, folder_type)

    # Load the current download list
    download_list = load_download_list()

    if folder_type == "comic":
        folder = COMICS_DIRECTORY
    else:
        folder = MANGA_DIRECTORY

    series_folder = os.path.join(folder, series_name)

    poster_path = os.path.join(folder, series_name, "cover_image.jpg")

    if read_online_link.endswith("GN"):
        one_shot = True
    else:
        one_shot = False

    date_added = datetime.now().strftime("%Y-%m-%d")

    # Create a dictionary for the new entry
    new_entry = {
        "series_name": modified_series_name,
        "read_online_link": modified_link,
        "folder_type": folder_type,
        "series_folder": series_folder,
        "poster_path": poster_path,
        "description": description,
        "one_shot": one_shot,
        "date_added": date_added
    }

    # Check if the series already exists in the list
    if any(item['series_name'] == modified_series_name and item['read_online_link'] == modified_link for item in download_list):
        print("The series is already in the download list.")
        return

    # Add the new entry to the list
    download_list.append(new_entry)

    # Save the updated download list to the file
    try:
        with open(DOWNLOAD_LIST_PATH, 'w') as file:
            json.dump(download_list, file, indent=4)
        print(f"Added {modified_series_name} to the download list.")
    except Exception as e:
        print(f"An error occurred while saving changes to download_list: {e}")


def modify_series_and_link(series_name, read_online_link, folder_type):
    # If the folder type is 'comic', remove the '#number' from both the series name and the URL

    # Remove '#number' from the series_name
    series_name = re.sub(r"\s*#\d+", "", series_name)
    series_name = re.sub(r'[<>:"/\\|?*]', ' -', series_name)

    # Remove '#number' or '/number' from the read_online_link
    read_online_link = re.sub(r"(\/|#)\d+$", "", read_online_link)

    return series_name, read_online_link


def remove_from_download_list(series_name, read_online_link, files_or_list):
    """Remove a series from the download list."""
    # Load the current download list
    download_list = load_download_list()

    # Filter out the series to be removed
    updated_list = [
        item for item in download_list
        if not (item['series_name'] == series_name and item['read_online_link'] == read_online_link)
    ]
    series_folder = None
    if files_or_list == "True":
        for item in download_list:
            if item['series_name'] == series_name and item['read_online_link'] == read_online_link:
                series_folder = item.get('series_folder', None)

        if os.path.exists(series_folder):
            shutil.rmtree(series_folder)

    # Check if something was removed
    if len(download_list) == len(updated_list):
        print("The specified series was not found in the download list.")
        return

    # Save the updated download list to the file
    try:
        with open(DOWNLOAD_LIST_PATH, 'w') as file:
            json.dump(updated_list, file, indent=4)
        print(f"Removed {series_name} from the download list.")
    except Exception as e:
        print(f"An error occurred while saving changes to download_list: {e}")

