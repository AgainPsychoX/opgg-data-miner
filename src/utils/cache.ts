import path from 'path'
import fs from 'fs/promises';
import { Region, canAccess, mapAndSetReplacer } from '@/common';
import { PlayerRawData } from '@/models/Player';
import { GameRawData } from '@/models/Game';

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
	gameIds: Set<string>;
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
	get _playersMetaFile() {
		return path.join(this._folder, 'playersMeta.json');
	}

	_cachedPlayers: Set<string> = new Set();
	_cachedGames: Set<string> = new Set();
	_cachedPlayersMeta: Map<string, PlayerCacheMeta> = new Map();

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

		if (await canAccess(this._playersMetaFile)) {
			const playersMeta = JSON.parse(await fs.readFile(this._playersMetaFile, 'utf-8')) as Record<string, PlayerCacheMeta>;
			for (const meta of Object.values(playersMeta)) {
				const raw = meta as any;
				meta.lastUpdatedAt = raw.lastUpdatedAt ? new Date(raw.lastUpdatedAt) : undefined;
				meta.lastGameCreatedAt = new Date(raw.lastGameCreatedAt);
				meta.gameIds = new Set(raw.gameIds);
			}
			this._cachedPlayersMeta = new Map(Object.entries(playersMeta));
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
				for (const participant of game.participants) {
					const meta = playersMeta[participant.summoner.name] ||= {
						lastGameCreatedAt: new Date(0),
						gameIds: new Set(),
					};

					meta.gameIds.add(id);
					meta.lastGameCreatedAt = new Date(Math.max(+meta.lastGameCreatedAt, +new Date(game.created_at)));
				}
			}
			else {
				console.warn(`Failed finding cached game ID: '${id}'`);
			}
		}
		this._cachedPlayersMeta = new Map(Object.entries(playersMeta));

		await fs.writeFile(this._playersMetaFile, JSON.stringify(playersMeta, mapAndSetReplacer, this._space), 'utf-8');
	}

	async getPlayerCacheMeta(userName: string): Promise<PlayerCacheMeta | undefined> {
		return this._cachedPlayersMeta.get(userName);
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
		await fs.writeFile(path.join(this._playersFolder, data.name) + '.json', JSON.stringify(data, undefined, this._space), 'utf-8');
		this._cachedPlayers.add(data.name);
		const meta: PlayerCacheMeta = this._cachedPlayersMeta.get(data.name) || { lastGameCreatedAt: new Date(0), gameIds: new Set() };
		meta.lastUpdatedAt = new Date(data.updated_at);
		this._cachedPlayersMeta.set(data.name, meta);
	}

	async getGamesForPlayer(userName: string): Promise<GameRawData[] | undefined> {
		const meta = this._cachedPlayersMeta.get(userName);
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

		for (const participant of data.participants) {
			const key = participant.summoner.name;
			const meta: PlayerCacheMeta = this._cachedPlayersMeta.get(key) || { lastGameCreatedAt: new Date(0), gameIds: new Set() };
			meta.lastGameCreatedAt = new Date(Math.max(+meta.lastGameCreatedAt, +new Date(data.created_at)));
			meta.gameIds.add(data.id);
			this._cachedPlayersMeta.set(key, meta);
		}

		// TODO: move to dispose, on process end
		await fs.writeFile(this._playersMetaFile, JSON.stringify(this._cachedPlayersMeta, mapAndSetReplacer, this._space), 'utf-8');
	}
}
