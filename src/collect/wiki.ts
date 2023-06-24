import axios from "axios"
import * as cheerio from 'cheerio';
import { commonHeaders } from "@/common";

export interface WikiData {
	champions: WikiChampionData[];
	factions: WikiFactionData[],
}

export interface WikiCharacterData {
	name: string;
	description: string;
	factions: string[];
	relatedCharacters: string[];
}

export interface WikiChampionData extends WikiCharacterData {
	title: string;

	releaseDate: string; // date
	releasePatch: string;
	lastChangedPatch: string;

	classes: string[];
	legacyClasses: string[];
	positions: string[];

	resource: string;
	rangeType: string;

	stats: {
		baseHealth: number;
		extraHealthPerLevel: number;
		baseHealthRegeneration: number;
		extraHealthRegenerationPerLevel: number;

		baseMana?: number;
		extraManaPerLevel?: number;
		baseManaRegeneration?: number;
		extraManaRegenerationPerLevel?: number;

		baseArmour: number;
		extraArmourPerLevel: number;
		baseMagicResistance: number;
		extraMagicResistancePerLevel: number;

		movementSpeed: number;

		baseAttackDamage: number;
		extraAttackDamagePerLevel: number;
		baseAttackSpeed: number;
		extraAttackSpeedPerLevel: number;
		customAttackSpeedRatio?: number; // if not set, falls back to base attack speed for ratio
		attackRange: number;
		attackWindup: number;

		// TODO: more?
	};

	rating: {
		damage: number; // of 3
		toughness: number;
		control: number;
		mobility: number;
		utility: number;
		style: number; // of 100
		difficulty: number; // of 3
	};

	blueEssencePrice: number;
	riotPointsPrice: number;
}

export interface WikiFactionData {
	name: string;
	description: string;
	champions: string[];
	otherRelatedChampions: string[];
}

export async function collectWiki() {
	const result: WikiData = {
		champions: [],
		factions: [],
	};
	
	for (const name of await collectPlayableCharactersNames()) {
		// TODO: detect TBA/incoming characters instead except-listing them here
		if (['norra', 'naafiri'].includes(name.toLowerCase())) continue; // skip, as wiki not yet filled up for incoming champs in the game

		result.champions.push({
			...await collectChampionPage(name),
			...await collectGeneralCharacterPage(name),
		});
	}

	for (const name of await collectFactionsNames()) {
		const data = await collectFaction(name);
		result.factions.push(data);

		for (const championName of data.champions) {
			const found = result.champions.find(x => x.name == championName);
			if (found) {
				found.factions.push(data.name);
			}
		}
	}

	return result;
}

export async function collectPlayableCharactersNames() {
	console.debug(`Collecting playable characters names`);
	const { data } = await axios({
		url: `https://leagueoflegends.fandom.com/wiki/Category:Playable_characters`,
		headers: commonHeaders
	});
	const $ = cheerio.load(data);
	return $('#content .category-page__member-link')
		.map((i, e) => ($(e).attr('title') || $(e).text()).trim());
}

export async function collectGeneralCharacterPage(name: string) {
	console.debug(`Collecting general character page for '${name}'`);

	const result: WikiCharacterData = {
		name: '',
		description: '',
		factions: [], // to be filled by `collectWiki`
		relatedCharacters: [],
	};
	
	const { data } = await axios({
		url: `https://leagueoflegends.fandom.com/wiki/${name}`,
		headers: commonHeaders
	});
	const $ = cheerio.load(data);

	const toc = $('#toc');
	
	{
		let text = '';
		toc.parent().contents().each((i, e) => {
			const h = $(e);
			if (h.is('table') || h.is('figure') || h.is('aside') || h.is('dl') || h.is('div.league-font') || h.is(':has(aside)')) return true;
			if (h.is(toc)) return false;
			text += h.text() + ' ';
			return true;
		});
		result.description = text.replace(/(\r|\n|\s)+/g, ' ').replace(/\[\d+\]/g, '').trim();
	}
	
	// TODO: more data to be scrapped, but inconsistent across other champs pages
	const infobox = $('#content aside.portable-infobox > h2.pi-title').first().parent();
	result.name = infobox.find('h2').first().text().trim();
	result.relatedCharacters = infobox.find('.pi-navigation .character-background-icon a')
		.map((i, e) => $(e).attr('title')!.trim())
		.toArray().filter(e => !(e.startsWith('File:') || e.startsWith('Category:')));

	return result;
}

export async function collectChampionPage(name: string) {	
	console.debug(`Collecting champion page for '${name}'`);

	const { data } = await axios({
		url: `https://leagueoflegends.fandom.com/wiki/${name}/LoL`,
		headers: commonHeaders
	});
	const $ = cheerio.load(data);

	const champTag = (name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()).replace(/'/g, '');

	const infobox = $('#content aside.portable-infobox > h2.pi-title').first().parent();
	const result: WikiChampionData = {
		name: infobox.find('h2').first().text().trim() || $('#firstHeading').text().trim(),
		description: '', // to be filled by `collectGeneralCharacterPage`
		factions: [], // to be filled by `collectWiki` 
		relatedCharacters: [], // to be filled by `collectGeneralCharacterPage`
		title: infobox.find('h2 ~ div:first').text().trim(),
		releaseDate: infobox.find(".pi-item .pi-data-label:contains('Release date')").parent().find('.pi-data-value').text().trim(),
		releasePatch: infobox.find(".pi-item .pi-data-label:contains('Release date')").parent().find('.pi-data-value a').attr('title')?.trim() || '',
		lastChangedPatch: infobox.find(".pi-item .pi-data-label:contains('Last changed')").parent().find('.pi-data-value a').attr('title')?.trim() || '',
		classes: infobox.find(".pi-item .pi-data-label:contains('Class')").parent().find('.pi-data-value a:not(:has(img))').map((i, e) => $(e).text().trim()).toArray(),
		legacyClasses: infobox.find(".pi-item .pi-data-label:contains('Legacy')").parent().find('.pi-data-value a:not(:has(img))').map((i, e) => $(e).text().trim()).toArray(),
		positions: infobox.find(".pi-item .pi-data-label:contains('Position')").parent().find('.pi-data-value a:not(:has(img))').map((i, e) => $(e).text().trim()).toArray(),
		resource: infobox.find(".pi-item .pi-data-label:contains('Resource')").parent().find('.pi-data-value a:not(:has(img))').first().text().trim(),
		rangeType: infobox.find(".pi-item .pi-data-label:contains('Range type')").parent().find('.pi-data-value a:not(:has(img))').first().text().trim(),
		blueEssencePrice: 0,
		riotPointsPrice: 0,
		stats: {
			baseHealth: parseFloat($(`#Health_${champTag}`).text()),
			extraHealthPerLevel: parseFloat($(`#Health_${champTag}_lvl`).text()),
			baseHealthRegeneration: parseFloat($(`#HealthRegen_${champTag}`).text()),
			extraHealthRegenerationPerLevel: parseFloat($(`#HealthRegen_${champTag}_lvl`).text()),

			baseMana: parseFloat($(`#ResourceBar_${champTag}`).text()) || undefined,
			extraManaPerLevel: parseFloat($(`#ResourceBar_${champTag}_lvl`).text()) || undefined,
			baseManaRegeneration: parseFloat($(`#ResourceRegen_${champTag}`).text()) || undefined,
			extraManaRegenerationPerLevel: parseFloat($(`#ResourceRegen_${champTag}_lvl`).text()) || undefined,

			baseArmour: parseFloat($(`#Armor_${champTag}`).text()),
			extraArmourPerLevel: parseFloat($(`#Armor_${champTag}_lvl`).text()),
			baseMagicResistance: parseFloat($(`#MagicResist_${champTag}`).text()),
			extraMagicResistancePerLevel: parseFloat($(`#MagicResist_${champTag}_lvl`).text()),

			movementSpeed: parseFloat($(`#AttackDamage_${champTag}`).text()),

			baseAttackDamage: parseFloat($(`#AttackDamage_${champTag}`).text()),
			extraAttackDamagePerLevel: parseFloat($(`#AttackDamage_${champTag}_lvl`).text()),
			baseAttackSpeed: parseFloat(($(".lvlselect .pi-item .pi-faux-label:contains('Base AS')")[0]!.nextSibling as any).nodeValue),
			extraAttackSpeedPerLevel: parseFloat($(`#AttackSpeedBonus_${champTag}_lvl`).text()),
			customAttackSpeedRatio: parseFloat(($(".lvlselect .pi-item .pi-faux-label:contains('AS ratio')")[0]!.nextSibling as any).nodeValue) || undefined,
			attackRange: parseFloat($(`#AttackRange_${champTag}`).text()),
			attackWindup: parseFloat(($(".lvlselect .pi-item .pi-faux-label:contains('Attack windup')")[0]!.nextSibling as any).nodeValue),
		},
		rating: {
			damage: 0,
			toughness: 0,
			control: 0,
			mobility: 0,
			utility: 0,
			style: parseInt(infobox.find(".pi-item .pi-data-value .champion_style img:nth(1)").first().attr('alt')!.trim().split(/ /g).at(-1)!),
			difficulty: parseInt(infobox.find(".pi-item .pi-data-label:contains('Difficulty')").parent().find('.pi-data-value img').first().attr('alt')!.trim().split(/ /g).at(-1)!),
		},
	};
	const [be, rp] = infobox.find(".pi-item .pi-data-label:contains('Store price')").parent().find('.pi-data-value a:not(:has(img))').map((i, e) => parseInt($(e).text().trim())).toArray();
	if (be) result.blueEssencePrice = be;
	if (rp) result.blueEssencePrice = rp;
	const statsWheelStats = infobox.find('.stat-wheel:first').attr('data-values')!.split(/;/g).map(x => parseInt(x));
	result.rating.damage    = statsWheelStats[0]!
	result.rating.toughness = statsWheelStats[1]!
	result.rating.control   = statsWheelStats[2]!
	result.rating.mobility  = statsWheelStats[3]!
	result.rating.utility   = statsWheelStats[4]!

	// TODO: more data to be scrapped, but inconsistent across other champs pages

	return result as WikiChampionData;
}

export async function collectFactionsNames() {
	console.debug(`Collecting factions names`);
	const { data } = await axios({
		url: `https://leagueoflegends.fandom.com/wiki/Category:Factions`,
		headers: commonHeaders
	});
	const $ = cheerio.load(data);
	const result = $('#content .category-page__member-link')
		.map((i, e) => ($(e).attr('title') || $(e).text()).trim())
		.toArray().filter(x => !(x.startsWith('File:') || x.startsWith('Category:')));

	// TODO: deal with extras better
	result.push('Hextech');

	return result;
}

export async function collectFaction(name: string)  {
	console.debug(`Collecting faction page for '${name}'`);

	const result: WikiFactionData = {
		name: '',
		description: '',
		champions: [],
		otherRelatedChampions: [],
	};

	const { data } = await axios({
		url: `https://leagueoflegends.fandom.com/wiki/${name}`,
		headers: commonHeaders
	});
	const $ = cheerio.load(data);

	const infobox = $('#content aside.portable-infobox > h2.pi-title').parent();
	result.name = infobox.find('h2').first().text().trim() || $('#firstHeading').text().trim();

	const toc = $('#toc');
	
	{
		let text = '';
		toc.parent().contents().each((i, e) => {
			const h = $(e);
			if (h.is('table') || h.is('figure') || h.is('aside')) return true;
			if (h.is(toc)) return false;
			text += h.text() + ' ';
			return true;
		});
		result.description = text.replace(/(\r|\n|\s)+/g, ' ').replace(/\[\d+\]/g, '').trim();
	}
	
	{
		result.champions = $('#toc ~ h3').filter((i, e) => !!$(e).text().match(/cha\w+s of| champions/i)).first()
			.nextAll('.wikia-gallery-caption-below').first()
			.find('.wikia-gallery-item')
			.map((i, e) => $(e).find('.lightbox-caption').text())
			.toArray();
		;
		const otherRelatedHeader = $('#toc ~ h3').filter((i, e) => !!$(e).text().match(/related cha|notable users/i)).first();
		if (otherRelatedHeader.next().is('ul')) {
			// result.otherRelatedNotes = otherRelatedHeader.next().find('li')
			// 	.map((i, e) => $(e).text().replace(/\r|\n|\s\s+/g, ' ').trim());
			result.otherRelatedChampions = otherRelatedHeader.next().find('.character-background-icon.label-after :not(.border) a')
				.map((i, e) => ($(e).attr('title') || $(e).text()).replace(/'s/i, '').trim())
				.toArray();
		}
	}

	return result;
}
