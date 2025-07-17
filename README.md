# UsefulQueries

Code for usefulQueries

Context: <https://www.wikidata.org/wiki/User:Kristbaum/usefulQueries>

## Testing Locally in Browser

To test this script locally before deploying to MediaWiki, you can use the browser's developer console:

### Method 1: Direct Console Testing

1. Navigate to any Wikidata entity page (e.g., <https://www.wikidata.org/wiki/Q42>)
2. Open your browser's Developer Tools (F12 or Ctrl+Shift+I)
3. Go to the Console tab
4. Copy and paste the entire content of `usefulQueries.js` into the console
5. Press Enter to execute the script
6. The script should immediately add icons and popups to relevant statements on the page

### Method 2: Using a Bookmarklet

1. Create a new bookmark in your browser
2. Set the URL to:

   ```javascript
   javascript:(function(){var script=document.createElement('script');script.src='https://raw.githubusercontent.com/kristbaum/usefulQueries/main/usefulQueries.js';document.head.appendChild(script);})();
   ```

3. Navigate to any Wikidata entity page
4. Click the bookmarklet to load and execute the script
