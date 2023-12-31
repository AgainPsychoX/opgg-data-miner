import path from 'path'
import fs from 'fs/promises';
import { Region, canAccess, mapAndSetReplacer } from '@/common';
import { PlayerRawData } from '@/models/Player';
import { GameRawData, rankValue } from '@/models/Game';

var defaultCache: Cache | undefined;

export async function getDefaultCache(region: Region) {
	if (!defaultCache) {
		defaultCache = await Cache.usingFilesystemPath(`cache/${region}`);
	}
	return defaultCache;
}

interface PlayerCacheMeta {
	lastUpdatedAt?: Date; // undefined if player not cached
	lastGameCreatedAt: Date; // earliest date (`new Date(0)`) if no games
	id: number;
	gameIds: Set<string>;
	rankValue: number;
}

function newPlayerCacheMeta(): PlayerCacheMeta {
	return {
		lastGameCreatedAt: new Date(0), 
		gameIds: new Set(),
		id: NaN,
		rankValue: -1000,
	};
}

/**
 * Provides caching for OpGG related scrapping in context of specific region.
 */
export class Cache {
	_folder: string;

	get _playersFolder() {
		return path.join(this._folder, 'players');
	}
	get _gamesFolder() {
		return path.join(this._folder, 'games');
	}
	get _playersCacheMetaFile() {
		return path.join(this._folder, 'playersMeta.json');
	}

	_cachedPlayers: Set<string> = new Set();
	_cachedGames: Set<string> = new Set();
	_playersCacheMeta: Map<string, PlayerCacheMeta> = new Map();

	_space: string = '\t';

	constructor(folder: string) {
		this._folder = folder;
	}

	static async usingFilesystemPath(folder: string) {
		folder = path.resolve(folder);
		console.debug(`Using cache with folder: ${folder}`);
		const instance = new Cache(folder);
		await fs.mkdir(instance._playersFolder, { recursive: true });
		await fs.mkdir(instance._gamesFolder, { recursive: true });
		await instance._readFolder();
		return instance;
	}

	async _readFolder() {
		this._cachedPlayers = new Set((await fs.readdir(this._playersFolder)).map(name => name.replace(/\.json$/, '')));
		this._cachedGames = new Set((await fs.readdir(this._gamesFolder)).map(name => name.replace(/\.json$/, '')));

		if (await canAccess(this._playersCacheMetaFile)) {
			const playersMeta = JSON.parse(await fs.readFile(this._playersCacheMetaFile, 'utf-8')) as Record<string, PlayerCacheMeta>;
			for (const meta of Object.values(playersMeta)) {
				const raw = meta as any;
				meta.lastUpdatedAt = raw.lastUpdatedAt ? new Date(raw.lastUpdatedAt) : undefined;
				meta.lastGameCreatedAt = new Date(raw.lastGameCreatedAt);
				meta.gameIds = new Set(raw.gameIds);
			}
			this._playersCacheMeta = new Map(Object.entries(playersMeta));
		}
		else {
			await this._regeneratePlayersMetaCache();
		}
	}

	async _regeneratePlayersMetaCache() {
		console.debug(`Regenerating players meta cache...`);
		const playersMeta: Record<string, PlayerCacheMeta> = {};
		for (const id of this._cachedGames) {
			const game = await this.getGame(id);
			if (game) {
				const createdAt = new Date(game.created_at);
				for (const participant of game.participants) {
					const meta = playersMeta[participant.summoner.name] ||= newPlayerCacheMeta();

					meta.gameIds.add(id);
					if (+meta.lastGameCreatedAt < +createdAt) {
						meta.lastGameCreatedAt = createdAt;
						meta.rankValue = rankValue(participant.tier_info);
					}
				}
			}
			else {
				console.warn(`Failed finding cached game ID: '${id}'`);
			}
		}
		this._playersCacheMeta = new Map(Object.entries(playersMeta));

		await fs.writeFile(this._playersCacheMetaFile, JSON.stringify(playersMeta, mapAndSetReplacer, this._space), 'utf-8');
	}

	getPlayerCacheMeta(userName: string): PlayerCacheMeta | undefined {
		return this._playersCacheMeta.get(userName);
	}

	/**
	 * Finds player data in the cache.
	 * @param userName player to look for
	 * @returns Cached player data or null if not found in the cache.
	 */
	async getPlayerData(userName: string): Promise<PlayerRawData | undefined> {
		if (!this._cachedPlayers.has(userName)) return undefined;
		return JSON.parse(await fs.readFile(path.join(this._playersFolder, userName) + '.json', 'utf-8')) as PlayerRawData;
	}

	/**
	 * Puts player data to the cache.
	 * @param data Player data to be cached.
	 */
	async putPlayerData(data: PlayerRawData): Promise<void> {
		if (!data.region) throw new Error("Expected region to be filled after downloading");
		const file = path.join(this._playersFolder, data.name) + '.json';
		await fs.writeFile(file, JSON.stringify(data, undefined, this._space), 'utf-8');
		this._cachedPlayers.add(data.name);
		const meta: PlayerCacheMeta = this._playersCacheMeta.get(data.name) || newPlayerCacheMeta();
		meta.id = data.id;
		meta.lastUpdatedAt = new Date(data.updated_at);
		if (data.lp_histories.length > 0) {
			const newestTierInfo = data.lp_histories
				.map(x => [new Date(x.created_at), x.tier_info] as const)
				.reduce((previous, current) => +previous[0] < +current[0] ? current : previous)[1];
			meta.rankValue = rankValue(newestTierInfo);
		}
		this._playersCacheMeta.set(data.name, meta);
	}

	async getGamesForPlayer(userName: string): Promise<GameRawData[] | undefined> {
		const meta = this._playersCacheMeta.get(userName);
		if (meta) {
			const games: GameRawData[] = [];
			for (const id of meta.gameIds) {
				const game = await this.getGame(id);
				if (game) {
					games.push(game);
				}
				else {
					console.warn(`Failed finding cached game ID: '${id}' for user: '${userName}'`);
				}
			}
			games.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
			return games;
		}
		else {
			return undefined;
		}
	}

	async getGame(id: string): Promise<GameRawData | undefined> {
		if (!this._cachedGames.has(id)) return undefined;
		return JSON.parse(await fs.readFile(path.join(this._gamesFolder, id) + '.json', 'utf-8')) as GameRawData;
	}

	async putGame(data: GameRawData): Promise<void> {
		await fs.writeFile(path.join(this._gamesFolder, data.id) + '.json', JSON.stringify(data, undefined, this._space), 'utf-8');
		this._cachedGames.add(data.id);
		const createdAt = new Date(data.created_at);
		
		for (const participant of data.participants) {
			const key = participant.summoner.name;
			const meta: PlayerCacheMeta = this._playersCacheMeta.get(key) || newPlayerCacheMeta();
			meta.id = participant.summoner.id;
			if (+meta.lastGameCreatedAt < +createdAt) {
				meta.lastGameCreatedAt = createdAt;
				meta.rankValue = rankValue(participant.tier_info);
			}
			meta.gameIds.add(data.id);
			this._playersCacheMeta.set(key, meta);
		}
	}

	async savePlayersCacheMeta() {
		// TODO: move to dispose, on process end
		await fs.writeFile(this._playersCacheMetaFile, JSON.stringify(this._playersCacheMeta, mapAndSetReplacer, this._space), 'utf-8');
	}
}
