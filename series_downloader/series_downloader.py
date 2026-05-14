import datetime
import re
import threading

import download_list_manager
from config import MANGA_DIRECTORY, COMICS_DIRECTORY
from series_downloader.download_tools import *


background_task_thread = None


def start_background_task() -> object:
    global background_task_thread

    if not (background_task_thread and background_task_thread.is_alive()):
        print("Starting background task...")
        background_task_thread = threading.Thread(target=background_task, daemon=True)
        background_task_thread.start()
    else:
        print("Background task is already running!")


def background_task():
    """The task that runs in the background."""
    print(f"Background task started in thread: {threading.current_thread().name}")
    while True:
        download()
        print(f"{datetime.datetime.now()} - Background task is running...")
        time.sleep(30)


def download():
    print("Starting Downloads")
    download_list = download_list_manager.load_download_list()

    for entry in download_list:
        series_name = entry["series_name"]
        read_online_link = entry["read_online_link"]
        folder_type = entry["folder_type"]

        series_name = re.sub(r'[<>:"/\\|?*]', ' -', series_name)

        if read_online_link == "Unavailable":
            print(f"{series_name} is Unavailable")
            break

        if folder_type == "comic":
            folder = COMICS_DIRECTORY
            cover_name = read_online_link.split('/')[4]
        else:
            folder = MANGA_DIRECTORY
            cover_name = read_online_link.split('/')[4].lower()  # Fixed index

        series_folder = os.path.join(folder, series_name)
        temp_folder = os.path.join(series_folder, "tempfolder")

        if os.path.exists(temp_folder):
            shutil.rmtree(temp_folder)

        if not os.path.exists(series_folder):
            os.makedirs(series_folder, exist_ok=True)
            print(f"Created folder: {series_folder}")

        img_number = 1

        if read_online_link.endswith("GN"):
            chapter_num = 0
            gn_or_1 = "GN"
        else:
            chapter_num = 1
            gn_or_1 = "1"

        while True:
            if chapter_num <= 1:
                get_cover_image(series_folder, folder_type, cover_name, gn_or_1)

            if read_online_link.endswith("GN"):
                path_file_to_download = os.path.join(series_folder, f"{series_name}.cbz")
                if os.path.exists(os.path.join(series_folder, f"{series_name}.zip")):
                    os.remove(os.path.join(series_folder, f"{series_name}.zip"))
            else:
                path_file_to_download = os.path.join(series_folder, f"{series_name} - {chapter_num}.cbz")
                if os.path.exists(os.path.join(series_folder, f"{series_name} - {chapter_num}.zip")):
                    os.remove(os.path.join(series_folder, f"{series_name} - {chapter_num}.zip"))

            if os.path.exists(path_file_to_download):
                if os.path.getsize(path_file_to_download) <= 1024:
                    os.remove(path_file_to_download)
                else:
                    if chapter_num <= 0:
                        break
                    chapter_num += 1
                    continue

            url = make_url(read_online_link, chapter_num, img_number, folder_type)
            is_valid_url = valid_url(url)

            if not os.path.exists(path_file_to_download) and is_valid_url:
                if not os.path.exists(temp_folder):
                    os.makedirs(temp_folder, exist_ok=True)
                download_images(series_name, url, series_folder, temp_folder, img_number)

                response = requests.get(url, stream=True)
                if response.history:
                    break
                else:
                    img_number += 1
            else:
                if chapter_num <= 0:
                    if os.path.exists(temp_folder):
                        make_cbz_file(temp_folder, path_file_to_download)
                    break
                else:
                    if not is_valid_url and img_number == 1:
                        break
                    if os.path.exists(temp_folder):
                        make_cbz_file(temp_folder, path_file_to_download)
                    img_number = 1
                    chapter_num += 1
    return  # Optionally return something like a list of downloaded files
