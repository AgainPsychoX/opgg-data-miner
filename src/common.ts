
export const knownRegions = ['eune', 'euw', 'na', 'lan', 'oce', 'ru', 'jp', 'br', 'tr', 'las', 'kr'] as const;
export type Region = typeof knownRegions[number];

export function parseRegion(string: string): Region | undefined {
	string = string.toLowerCase();
	if (!knownRegions.includes(string as Region)) {
		return undefined;
	}
	return string as Region;
}

export function parseTimestamp(string: string): Date | undefined {
	const date = new Date(string);
	if (isNaN(+date)) {
		console.warn(`Invalid timestamp!`)
		return undefined;
	}
	return date;
}

export const commonHeaders = {
	// User-Agent need to be modern browser - if not, you get some other version of page.
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
}

export async function delay(milliseconds: number) {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}
