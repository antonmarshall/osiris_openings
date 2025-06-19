import requests
from bs4 import BeautifulSoup
import re
import csv
import os

def extract_game_urls(url):
    response = requests.get(url)

    if response.status_code != 200:
        print(f"Failed to retrieve the page. Status code: {response.status_code}")
        return []

    soup = BeautifulSoup(response.text, 'html.parser')

    a_tags = soup.find_all('a', {'onclick': re.compile(r"ajaxPopup\('(https://www\.365chess\.com/show_game\.php\?g=\d+)','[^']*'")})
    game_urls = []
    match_count_page = 0

    for a_tag in a_tags:
        match = re.search(r"ajaxPopup\('(https://www\.365chess\.com/show_game\.php\?g=\d+)','[^']*'", a_tag.get('onclick'))
        if match:
            game_urls.append(match.group(1))
            match_count_page += 1
    
    return game_urls, match_count_page

def extract_all_game_urls(base_url, max_games=100):
    page = 1
    all_game_urls = []
    total_links_extracted = 0

    while True:
        current_page_url = f"{base_url}/?p={page}&start={40 * (page - 1)}"
        page_game_urls, match_count_page = extract_game_urls(current_page_url)

        if not page_game_urls:
            break

        print(f"\nExtracting URLs from page {page}...\n")
        all_game_urls.extend(page_game_urls)
        total_links_extracted += match_count_page
        print("Total links extracted from this page:", match_count_page)
        
        # Stop if we have enough games
        if total_links_extracted >= max_games:
            all_game_urls = all_game_urls[:max_games]
            break
            
        page += 1

    print("\nTotal links extracted from all pages:", len(all_game_urls))
    return all_game_urls

def save_urls_to_csv(urls, player_name):
    # Verwende das Parent-Verzeichnis (osiris_openings) statt das aktuelle script_directory (download)
    script_directory = os.path.dirname(os.path.abspath(__file__))
    parent_directory = os.path.dirname(script_directory)  # Ein Verzeichnis höher
    player_dir = os.path.join(parent_directory, "players", player_name)
    os.makedirs(player_dir, exist_ok=True)
    file_path = os.path.join(player_dir, "extracted_urls.csv")
    with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
        csv_writer = csv.writer(csvfile)
        csv_writer.writerow(['URL'])  # Schreibe die Kopfzeile

        for url in urls:
            csv_writer.writerow([url])

def main(player_name, max_games=100):
    url = "https://www.365chess.com/players/" + player_name
    all_urls = extract_all_game_urls(url, max_games=max_games)
    print(f"Scraped {len(all_urls)} URLs for player {player_name}.")
    if not all_urls:
        print(f"No game URLs found for player {player_name}!")
    save_urls_to_csv(all_urls, player_name)
    print(f"\nAll extracted URLs saved to players/{player_name}/extracted_urls.csv")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python save_all_game_links.py <player_name> [max_games]")
        sys.exit(1)
    player_name = sys.argv[1]
    max_games = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    main(player_name, max_games)