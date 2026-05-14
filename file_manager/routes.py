import re
import requests
from flask import render_template, request, Response, redirect, url_for
from flask_login import login_required
from bs4 import BeautifulSoup

import download_list_manager
from auth.permissions import admin_required
from config import SITE_NAME
from . import file_manager_blueprint
from .file_manga import fetch_manga, inspect_manga


@file_manager_blueprint.route("/file_manager")
@login_required
@admin_required
def file_manager():
    series_data = download_list_manager.load_download_list()

    return render_template("manage_files.html", site_name=SITE_NAME, series_data=series_data)


@file_manager_blueprint.route('/file_manager/add_series', methods=['GET'])
@login_required
@admin_required
def add_series():
    search_results = []
    search = request.args.get('search', None)

    # Get the checkbox values for manga and comic filters
    manga_filter = request.args.get("manga") == "on"
    comic_filter = request.args.get("comic") == "on"

    # Debug: Print the filters to verify
    print(f"Manga filter: {manga_filter}, Comic filter: {comic_filter}")

    if search:
        if manga_filter:
            search_results.extend(fetch_manga(search))
        if comic_filter:
            search_results.extend(fetch_comics(search))

    # Debug: Print the search results
    print(f"Search results: {search_results}")

    # Render the template with the search results
    return render_template(
        "add_series.html",
        site_name=SITE_NAME,
        search_results=search_results,
        search=search,
        manga_checked=manga_filter,
        comic_checked=comic_filter
    )


@file_manager_blueprint.route('/file_manager/add_series/inspect', methods=['GET'])
@login_required
@admin_required
def add_series_inspect():
    series_name = request.args.get('series_name')
    search = request.args.get('search', '')  # Capture the search query
    manga = request.args.get('manga', '')  # Capture manga filter
    comic = request.args.get('comic', '')  # Capture comic filter
    type_ = request.args.get('type')  # Capture the type (manga or comic)

    if not series_name:
        return "Series name is required", 400

    # Fetch the series based on its type (manga or comic)
    search_results = []
    if type_ == 'manga':
        search_results = fetch_manga(series_name)
        if search_results:
            manga_url = f"https://ww1.mangafreak.me{search_results[0]['url']}"
            description = inspect_manga(manga_url)
            series = search_results[0]

        return render_template(
            "inspect_series.html",
            site_name=SITE_NAME,
            series_name=series['name'],
            series_url=series['url'],
            series_image=series['image'],
            series_chapters=series['chapter_info'],
            series_genres=series['genres'],
            series_type=series['manga_type'],
            search=search,
            manga=manga,  # Include manga filter in the template
            comic=comic,  # Include comic filter in the template
            type=type_,
            description=description,  # Pass the description to the template
            read_online_link=manga_url  # Pass the read online link to the template
        )

    elif type_ == 'comic':
        search_results = fetch_comics(series_name)
        if search_results:
            comic_url = search_results[0]['url']
            description, read_online_link = inspect_comics(comic_url)
            series = search_results[0]

            return render_template(
                "inspect_series.html",
                site_name=SITE_NAME,
                series_name=series['name'],
                series_url=series['url'],
                series_image=series['image'],
                series_chapters=series['chapter_info'],
                series_genres=series['genres'],
                series_type=series['manga_type'],
                search=search,
                manga=manga,  # Include manga filter in the template
                comic=comic,  # Include comic filter in the template
                type=type_,
                description=description,  # Pass the description to the template
                read_online_link=read_online_link  # Pass the read online link to the template
            )

    if not search_results:
        return "No results found for the series", 404


@file_manager_blueprint.route('/proxy_image/<path:image_url>', methods=['GET'])
@login_required
@admin_required
def proxy_image(image_url):
    """Proxy the image request."""
    try:
        # Decode the URL from the request
        decoded_url = requests.utils.unquote(image_url)
        # Fetch the image content from the external source
        response = requests.get(decoded_url)

        # If the request is successful, return the image content as response
        if response.status_code == 200:
            return Response(response.content, mimetype=response.headers['Content-Type'])
        else:
            return "Image not found", 404
    except Exception as e:
        print(f"Error fetching image: {e}")
        return "Error fetching image", 500


@file_manager_blueprint.route('/file_manager/add_series_to_download_list', methods=['GET'])
@login_required
@admin_required
def add_series_to_download_list():
    # Get the series name and read link from the query parameters
    series_name = request.args.get('series_name')
    read_online_link = request.args.get('read_online_link')
    type_ = request.args.get('type')
    description = request.args.get('description')

    # Check if values exist
    if series_name and read_online_link and type_:

        download_list_manager.add_to_download_list(series_name, read_online_link, type_, description)

        return redirect(url_for("file_manager.file_manager"))
    else:
        return "Error: Missing series name or read link", 400


@file_manager_blueprint.route('/file_manager/confirm_delete/remove_series_to_download_list', methods=["GET", "POST"])
@login_required
@admin_required
def confirm_remove_series_to_download_list():
    if request.method == "POST":
        series_name = request.form.get('series_name')  # Fetch from form data
        read_online_link = request.form.get('read_online_link')  # Fetch from form data
        files_or_list = request.form.get('files_or_list')

        if series_name and read_online_link:
            download_list_manager.remove_from_download_list(series_name, read_online_link, files_or_list)
            print(f"Deleted: {series_name}")
            return redirect(url_for("file_manager.file_manager"))
        else:
            print("Error: Missing series_name or read_online_link in POST request")
            return "Error: Missing data", 400
    else:
        series_name = request.args.get('series_name')
        read_online_link = request.args.get('read_online_link')

    return render_template("confirm_delete_series.html", site_name=SITE_NAME, series_name=series_name, read_online_link=read_online_link)


def fetch_comics(query):
    """Fetch comic series from getcomics.org."""
    url = f"https://getcomics.org/?s={query}"
    try:
        response = requests.get(url)
        soup = BeautifulSoup(response.text, "html.parser")

        # Select parent div with the class 'post-list-posts'
        post_list = soup.select(".post-list-posts")

        results = []
        for post in post_list:
            # Select comic items within this parent div
            comic_items = post.select(".post-title a")  # Select each comic item block by post-title a tag

            for item in comic_items:
                # Title and URL
                title_tag = item
                if not title_tag:
                    continue  # Skip if no title found

                title = title_tag.text.strip()
                comic_url = title_tag['href']

                # Image URL (get the image related to the comic)
                image_tag = item.find_previous("img")
                image_url = image_tag['src'] if image_tag else ""

                # Chapter Info (if applicable)
                chapter_info_tag = item.find_next("p")
                chapter_info = chapter_info_tag.text.strip() if chapter_info_tag else "No chapter info"

                # Extract the year and remove it from chapter info, then add it to genres
                year_match = re.search(r"Year : (\d{4})", chapter_info)
                year = year_match.group(1) if year_match else None
                if year:
                    chapter_info = re.sub(r"Year : \d{4} \| Size : \d+ MB", "", chapter_info).strip()

                # Genres (if applicable, using tags found in the page)
                genre_tags = item.find_next("span", class_="cat-links")  # Assuming genres are inside a span
                genres = [genre.text.strip() for genre in genre_tags.find_all("a")] if genre_tags else []
                if year:
                    genres.append(f"{year}")  # Add the year to the genres list

                # Additional metadata (if any, like type or other information)
                comic_type_tag = item.find_next("span", class_="entry-meta")
                manga_type = comic_type_tag.text.strip() if comic_type_tag else "Comic"

                # Collect all information for each comic item
                results.append({
                    "name": title,
                    "url": comic_url,
                    "image": image_url,
                    "chapter_info": chapter_info,
                    "genres": genres,
                    "manga_type": manga_type,  # Updated to comic_type
                })

        return results  # Return the list of comic items
    except Exception as e:
        print(f"Error fetching comics: {e}")
        return []


def inspect_comics(comic_url):
    try:
        # Send an HTTP GET request to fetch the page content
        response = requests.get(comic_url)
        response.raise_for_status()  # Raise an error for bad status codes

        # Parse the HTML content using BeautifulSoup
        soup = BeautifulSoup(response.text, "html.parser")

        # Find the description of the comic (usually in a paragraph or div tag)
        description_tag = soup.find("p", style="text-align: justify;")  # Find the div that contains the description

        if description_tag:
            # Remove the <strong> title section and get the rest of the text
            for strong_tag in description_tag.find_all("strong"):
                strong_tag.decompose()  # This will remove the <strong> tags from the description

            # Extract the text from the remaining content, clean up extra spaces and newlines
            description = description_tag.get_text(separator="\n", strip=True)
        else:
            description = "No description available"

        # Find the link to read the comic online (usually in an anchor tag with a specific class)
        read_online_link_tag = soup.find("a", title="Read Online")  # Check for read online button/link
        read_online_link = read_online_link_tag['href'] if read_online_link_tag else "Unavailable"
        return description, read_online_link

    except Exception as e:
        print(f"Error fetching comic details: {e}")
        return None, None