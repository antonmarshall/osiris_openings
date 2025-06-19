# installiere vorher: pip install playwright
from playwright.sync_api import sync_playwright

def fetch_search_input_html():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("https://database.chessbase.com")
        # Warte, bis das Suchfeld da ist (Selector anpassen, falls nötig)
        page.wait_for_selector("input")
        # Nimm das erste input-Feld und gib seine outerHTML aus
        html = page.query_selector("input").evaluate("el => el.outerHTML")
        print(html)
        browser.close()

if __name__ == "__main__":
    fetch_search_input_html()
