import os
import shutil
import time

import requests


def make_cbz_file(temp_folder, path_file_to_download):
    # Ensure you are passing the correct directory without the .zip extension
    archive_path = os.path.splitext(path_file_to_download)[0]

    try:
        shutil.make_archive(archive_path, 'zip', temp_folder)  # Create the .zip file

        time.sleep(0.1)  # Add a slight delay to ensure file release

        # Rename the .zip file to .cbz
        os.rename(f"{archive_path}.zip", path_file_to_download)
        print(f"Downloaded: {path_file_to_download}")

    except PermissionError as e:
        print(f"PermissionError: {e}. Retrying...")
        time.sleep(0.5)  # Wait and retry in case the file lock is temporary
        try:
            os.rename(f"{archive_path}.zip", path_file_to_download)
        except Exception as retry_error:
            print(f"Retry failed: {retry_error}")
            return

    except Exception as e:
        print(f"Error creating CBZ file: {e}")
        return

    # Remove the temp folder
    if os.path.exists(temp_folder):
        try:
            shutil.rmtree(temp_folder)
        except Exception as e:
            print(f"Failed to remove temp folder: {e}")


def download_images(series_name, url, series_folder, temp_folder, img_number, retries=3):
    # Create the save folder if it doesn't exist
    if not os.path.exists(series_folder):
        os.makedirs(series_folder)

    attempt = 0
    while attempt < retries:
        try:
            img_name = os.path.join(temp_folder, f"{series_name} - {img_number}.jpg")

            response = requests.get(url, stream=True, timeout=30)
            if response.status_code == 200:
                with open(img_name, 'wb') as img_file:
                    for chunk in response.iter_content(1024):
                        img_file.write(chunk)
                return
            else:
                print(f"Failed to download the image. Status code: {response.status_code}")
                break
        except requests.exceptions.ChunkedEncodingError as e:
            print(f"ChunkedEncodingError: {e}. Retrying ({attempt + 1}/{retries})...")
        except requests.exceptions.RequestException as e:
            print(f"RequestException: {e}. Retrying ({attempt + 1}/{retries})...")
        attempt += 1
        time.sleep(1)

    print(f"Failed to download image after {retries} attempts: {url}")


def make_url(read_online_link, chapter_num, img_number, folder_type):
    url_parts = read_online_link.split('/')
    if folder_type == "comic":
        main_part = url_parts[4]  # Assumes comic URLs have this structure
        if chapter_num > 0:
            if img_number < 10:
                url = f"https://readcomicsonline.ru/uploads/manga/{main_part}/chapters/{chapter_num}/0{img_number}.jpg"
            else:
                url = f"https://readcomicsonline.ru/uploads/manga/{main_part}/chapters/{chapter_num}/{img_number}.jpg"
        else:
            if img_number < 10:
                url = f"https://readcomicsonline.ru/uploads/manga/{main_part}/chapters/GN/0{img_number}.jpg"
            else:
                url = f"https://readcomicsonline.ru/uploads/manga/{main_part}/chapters/GN/{img_number}.jpg"
        return url
    else:
        name = url_parts[-1].lower()  # Use last part of URL, safer for varying lengths
        url = f"https://images.mangafreak.me/mangas/{name}/{name}_{chapter_num}/{name}_{chapter_num}_{img_number}.jpg"
        return url


def valid_url(url):
    try:
        # Send a GET request to the URL with a HEAD request to avoid downloading the entire image
        response = requests.head(url, allow_redirects=True, timeout=10)

        # Check if the response content type is an image (e.g., jpeg, png, gif)
        if 'image' in response.headers.get('Content-Type', ''):
            return True
        return False
    except requests.RequestException as e:
        print(f"Error with the URL: {url} -> {e}")
        return False


def get_cover_image(series_folder, folder_type, cover_name, gn_or_1, retries=3):
    if folder_type == "comic":
        url = f"https://readcomicsonline.ru/uploads/manga/{cover_name}/chapters/{gn_or_1}/01.jpg"

    else:
        url = f"https://images.mangafreak.me/manga_images/{cover_name}.jpg"

    img_name = os.path.join(series_folder, f"cover_image.jpg")

    if not os.path.exists(img_name):
        attempt = 0
        while attempt < retries:
            try:
                response = requests.get(url, stream=True, timeout=30)
                if response.status_code == 200:
                    with open(img_name, 'wb') as img_file:
                        for chunk in response.iter_content(1024):
                            img_file.write(chunk)
                    print(f"Cover Image Downloaded: {img_name}")
                    return
                else:
                    print(f"Failed to download the image. Status code: {response.status_code}")
                    break
            except requests.exceptions.ChunkedEncodingError as e:
                print(f"ChunkedEncodingError: {e}. Retrying ({attempt + 1}/{retries})...")
            except requests.exceptions.RequestException as e:
                print(f"RequestException: {e}. Retrying ({attempt + 1}/{retries})...")
            attempt += 1
            time.sleep(1)
    return
