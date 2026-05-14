import os
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Config directory and file paths
# CONFIG_DIRECTORY = "Z:\Programing\Python\ComicOrbit_files\config"
CONFIG_DIRECTORY = os.getenv("CONFIG_DIRECTORY", "/config")
CONFIG_FILE_PATH = os.path.join(CONFIG_DIRECTORY, 'config.json')
USERS_FOLDER_PATH = os.path.join(CONFIG_DIRECTORY, 'Users')
DOWNLOAD_LIST_PATH = os.path.join(CONFIG_DIRECTORY, 'download_list.json')


# Function to create a default config file if it doesn't exist
def create_default_config():
    try:
        default_config = {
            "MANGA_DIRECTORY": "/Manga",
            "COMICS_DIRECTORY": "/Comics",
            "SECRET_KEY": "comicorbit_key",
            "SITE_NAME": "ComicOrbit"
        }
        os.makedirs(CONFIG_DIRECTORY, exist_ok=True)  # Ensure the config directory exists
        with open(CONFIG_FILE_PATH, 'w') as config_file:
            json.dump(default_config, config_file, indent=4)
        logging.info("Default config file created.")
    except Exception as e:
        logging.error(f"Failed to create default config: {e}")
        raise


# Function to load the config from a JSON file
def load_config():
    try:
        if not os.path.exists(CONFIG_FILE_PATH):
            logging.warning("Config file not found. Creating a default config.")
            create_default_config()  # Create config file if it doesn't exist

        with open(CONFIG_FILE_PATH, 'r') as config_file:
            config_data = json.load(config_file)
            validate_config(config_data)  # Validate the loaded config
            return config_data

    except json.JSONDecodeError as e:
        logging.error(f"Invalid JSON in the config file: {e}")
        raise
    except Exception as e:
        logging.error(f"Error loading config: {e}")
        raise


# Function to validate the structure of the config file and add missing keys
def validate_config(config_data):
    required_keys = {
        "MANGA_DIRECTORY": "/Manga",
        "COMICS_DIRECTORY": "/Comics",
        "SECRET_KEY": "comicorbit_key",
        "SITE_NAME": "ComicOrbit"
    }

    # Check for missing keys and add them with default values
    for key, default_value in required_keys.items():
        if key not in config_data:
            logging.warning(f"Missing key '{key}'. Adding with default value.")
            config_data[key] = default_value

    # Write the updated config back to the file
    with open(CONFIG_FILE_PATH, 'w') as config_file:
        json.dump(config_data, config_file, indent=4)

    logging.info("Config validation passed and saved.")


# Function to update the config
def update_config(updates):
    try:
        config_data = load_config()  # Load the existing config
        config_data.update(updates)  # Apply updates
        with open(CONFIG_FILE_PATH, 'w') as config_file:
            json.dump(config_data, config_file, indent=4)
        logging.info("Config updated successfully.")
    except Exception as e:
        logging.error(f"Failed to update config: {e}")
        raise


# Load the config data from the JSON file
config = load_config()

# Retrieve the directories and other admin from the loaded JSON config
MANGA_DIRECTORY = os.path.abspath(config.get("MANGA_DIRECTORY", "/Manga"))
COMICS_DIRECTORY = os.path.abspath(config.get("COMICS_DIRECTORY", "/Comics"))
SECRET_KEY = config.get("SECRET_KEY", "comicorbit_key")
SITE_NAME = config.get("SITE_NAME", "ComicOrbit - uneditable")
