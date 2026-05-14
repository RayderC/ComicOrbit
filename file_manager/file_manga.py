import requests
from bs4 import BeautifulSoup
from time import sleep


def inspect_manga(manga_url):
    proxies = {
        "http": "http://50.174.7.159:80",  # Replace with your proxy
        "https": "http://67.43.227.230:16000",  # Replace with your proxy
    }

    # Reduced timeout for faster response
    timeout = 5  # Set to a reasonable time, e.g., 5 seconds

    try:
        response = requests.get(manga_url, proxies=proxies, timeout=timeout)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, "html.parser")
            description_div = soup.find("div", class_="manga_series_description")
            if description_div:
                description_p = description_div.find("p")
                if description_p:
                    return description_p.get_text(strip=True)
                else:
                    return "Description paragraph not found."
            else:
                return "Description div not found. Check the tag and class."
        else:
            print(f"Failed to fetch the page. Status code: {response.status_code}")
            return "Description Unavailable"
    except requests.Timeout:
        return "Request timed out. Try again later."
    except requests.RequestException as req_err:
        return f"HTTP Request error: {req_err}"
    except Exception as e:
        return f"Unexpected error: {e}"



def fetch_manga(query):
    """Fetch manga series from mangafreak.me."""
    url = f"https://ww1.mangafreak.me/Find/{query}"
    try:
        response = requests.get(url)
        soup = BeautifulSoup(response.text, "html.parser")

        manga_items = soup.select(".manga_search_item")  # Select each manga item block

        results = []
        for item in manga_items:
            # Title and URL
            title_tag = item.select_one("h3 a")
            if not title_tag:
                continue  # Skip if no title found

            title = title_tag.text.strip()
            manga_url = title_tag['href']

            # Image URL
            image_tag = item.select_one("img")
            image_url = image_tag['src'] if image_tag else ""

            # Chapter Info
            chapter_info_tag = item.select_one("div")
            chapter_info = chapter_info_tag.text.strip() if chapter_info_tag else "No chapter info"

            # Genres
            genre_tags = item.select("a")
            genres = [genre.text.strip() for genre in genre_tags if genre.text.strip()]

            # Additional metadata (e.g., manga type, read direction)
            manga_type_tag = item.select_one("strong")
            manga_type = manga_type_tag.text.strip() if manga_type_tag else "Unknown"

            # Collect all information for each manga item
            results.append({
                "name": title,
                "url": manga_url,
                "image": image_url,
                "chapter_info": chapter_info,
                "genres": genres,
                "manga_type": manga_type,
            })

        return results  # Return the list of manga items
    except Exception as e:
        print(f"Error fetching manga: {e}")
        return []