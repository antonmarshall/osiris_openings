import requests
import re
import os
from bs4 import BeautifulSoup

class ChessGameDownloader:
    def __init__(self, player_name):
        self.player_name = player_name
        # Verwende das Parent-Verzeichnis (osiris_openings) statt das aktuelle script_directory (download)
        script_directory = os.path.dirname(os.path.abspath(__file__))
        parent_directory = os.path.dirname(script_directory)  # Ein Verzeichnis höher
        self.urls_file_path = os.path.join(parent_directory, "players", player_name, "extracted_urls.csv")
        self.pgn_dir = os.path.join(parent_directory, "players", player_name, "pgn")
        os.makedirs(self.pgn_dir, exist_ok=True)
        # self.process_urls()  # Aufruf erfolgt explizit im Hauptteil

    def download_html(self, url):
        try:
            response = requests.get(url)
            response.raise_for_status()
            return response.text
        except requests.exceptions.RequestException as e:
            print(f'Download failed for {url}. Error: {e}')
            return None

    def extract_pgn_data_from_script(self, script):
        script_pattern = re.compile(r'pgn:\s*\'(.*?)\'', re.DOTALL)
        match = script_pattern.search(script)

        if match:
            return match.group(1).replace('\\n', ' ')
        else:
            print('No PGN data found in the script.')
            return None

    def save_pgn_data_to_pgn_file(self, game_number, general_info_lines, pgn_data):
        file_name = f"{self.player_name}_game_{game_number}.pgn"
        file_path = os.path.join(self.pgn_dir, file_name)
        with open(file_path, 'w', encoding='utf-8') as pgn_file:
            pgn_file.write(general_info_lines + '\n')
            pgn_file.write(pgn_data)
            print("File successfully saved as " + file_name)

    def extract_general_info(self, html_code):
        soup = BeautifulSoup(html_code, 'html.parser')
        div_element = soup.find('div', {'id': 'sidebar2'})

        game_info = dict()
        # --- Robuste Spielername-Extraktion ---
        white_name = ''
        black_name = ''
        if div_element:
            # Suche nach den Zeilen mit den Spielerbildern
            rows = div_element.find_all('tr')
            for row in rows:
                img = row.find('img')
                if img:
                    td = row.find_all('td')[-1]
                    # Extrahiere den Namen vor dem <em>
                    name = td.get_text(" ", strip=True)
                    name = name.split('(')[0].replace('\xa0', '').replace(',', '').strip()
                    if 'wp.gif' in img['src']:
                        white_name = name
                    elif 'bp.gif' in img['src']:
                        black_name = name
        game_info['White'] = white_name
        game_info['Black'] = black_name

        if div_element:
            general_info_table = div_element.find("table")

            event = re.findall(r'(?<=Event: ).*?(?=<)', str(general_info_table))
            game_info['Event'] = event[0] if event else ''

            site = re.findall(r'(?<=Site: ).*?(?=<)', str(general_info_table))
            game_info['Site'] = site[0] if site else ''

            date = re.findall(r'(?<=Date: ).*?(?=<)', str(general_info_table))
            game_info['Date'] = date[0] if date else ''

            runde = re.findall(r'(?<=Round: ).*?(?=<)', str(general_info_table))
            game_info['Round'] = runde[0] if runde else ''

            result = re.findall(r'(?<=Score: ).*?(?=<)', str(general_info_table))
            game_info['Result'] = result[0] if result else ''
            #print("the result is |"+ game_info['Result']+"|")

            white_elo = re.findall(r'<em>\((\d+)\)</em>', str(general_info_table))
            game_info['WhiteElo'] = white_elo[0] if white_elo else ''

            black_elo = re.findall(r'<em>\((\d+)\)</em></td></tr></table></td></tr>', str(general_info_table))
            game_info['BlackElo'] = black_elo[0] if black_elo else ''

            eco = re.findall(r'(?<=ECO: ).*?(?=<)', str(general_info_table))
            game_info['ECO'] = eco[0] if eco else ''

            return game_info
        else:
            print('No general info found on the page.')
            return None


    def create_game_info_lines(self, game_info):
        game_info_lines = ""
        for key, value in game_info.items():
            game_info_lines += f"[{key} {value!r}]\n".replace("'", '"')
        return game_info_lines

    def process_urls(self, max_games=None):
        with open(self.urls_file_path, 'r', encoding='utf-8') as file:
            next(file)  # Skip the first line (header)
            urls = file.readlines()
        if max_games is not None:
            urls = urls[:max_games]
        for index, url in enumerate(urls, start=1):
            print(f'Processing URL {index}/{len(urls)}: {url.strip()}')
            html_text = self.download_html(url.strip())
            if html_text:
                script_pattern = re.compile(r'<script language="JavaScript">(.*?)</script>', re.DOTALL)
                script_match = script_pattern.search(html_text)
                if script_match:
                    script_content = script_match.group(1)
                    pgn_data = self.extract_pgn_data_from_script(script_content)
                    if pgn_data:
                        game_info = self.extract_general_info(html_text)
                        if game_info:
                            general_info_lines = self.create_game_info_lines(game_info)
                            self.save_pgn_data_to_pgn_file(index, general_info_lines, pgn_data)

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python download_all_pgn.py <player_name> [max_games]")
        sys.exit(1)
    player_name = sys.argv[1]
    max_games = int(sys.argv[2]) if len(sys.argv) > 2 else None
    downloader = ChessGameDownloader(player_name)
    downloader.process_urls(max_games)