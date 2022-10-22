
export const knownRegions = ['eune', 'euw', 'na', 'lan', 'oce', 'ru', 'jp', 'br', 'tr', 'las', 'kr'] as const;
export type Region = typeof knownRegions[number];

export function parseRegion(string: string): Region | undefined {
	string = string.toLowerCase();
	if (!knownRegions.includes(string as Region)) {
		return undefined;
	}
	return string as Region;
}

export const commonHeaders = {
	// User-Agent need to be modern browser - if not, you get some other version of page.
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
}
