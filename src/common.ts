import fs from 'fs/promises';

export const knownRegions = ['eune', 'euw', 'na', 'lan', 'oce', 'ru', 'jp', 'br', 'tr', 'las', 'kr'] as const;
export type Region = typeof knownRegions[number];

export function parseRegion(string: string): Region | undefined {
	string = string.toLowerCase();
	if (!knownRegions.includes(string as Region)) {
		throw new Error(`Unknown region. Supported regions: ${knownRegions.map(x => x.toUpperCase()).join(', ')}.`);
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

export function canAccess(path: string, mode?: number) {
	return new Promise<boolean>(r => fs.access(path, mode).then(() => r(true)).catch(() => r(false)));
}

export async function parseSeparatedListOrLoadFromFile(string: string, splitRegex: RegExp = /\n|\r|\r\n/) {
	if (string.startsWith('@')) {
		const text = await fs.readFile(string.substring(1), 'utf-8');
		return text.split(splitRegex);
	}
	else {
		return string.split(',');
	}
}

export function mapAndSetReplacer(key: string, value: any) {
	if (value instanceof Map)
		return Object.fromEntries(value.entries());
	if (value instanceof Set)
		return Array.from(value.values());

	return value;
}
