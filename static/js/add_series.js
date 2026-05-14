async function performSearch() {
    const query = document.getElementById('search').value;
    const mangaFilter = document.getElementById('mangaFilter').checked;
    const comicFilter = document.getElementById('comicFilter').checked;

    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<p>Searching...</p>';

    try {
        const response = await fetch(`/search_series?query=${encodeURIComponent(query)}&manga=${mangaFilter}&comic=${comicFilter}`);
        const data = await response.json();

        if (data.length === 0) {
            resultsDiv.innerHTML = '<p>No results found.</p>';
        } else {
            resultsDiv.innerHTML = data.map(series => `<p>${series.name}</p>`).join('');
        }
    } catch (error) {
        resultsDiv.innerHTML = '<p>Error fetching results.</p>';
    }
}