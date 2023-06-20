import fs from 'fs/promises';
import { Argument, Command, Option } from "commander";
import neo4j, { DateTime, Session, int } from "neo4j-driver";
import { Region, parseRegion, parseSeparatedListOrLoadFromFile } from "@/common";
import { Cache, getDefaultCache } from "@/utils/cache";
import { rankTiers } from "@/models/Game";

async function addStaticData(opggData: any, session: Session) {
	await session.executeWrite(async (tx) => {
		tx.run(`
			CREATE 
				(:Position { key: 'TOP' }),
				(:Position { key: 'JUNGLE' }),
				(:Position { key: 'MID' }),
				(:Position { key: 'ADC' }),
				(:Position { key: 'SUPPORT' })
		`);
	});
	
	await session.executeWrite(async (tx) => {
		const championsDataValues = Object.values(opggData.props.pageProps.data.championsById) as any;
		console.log(`Adding champions data (about ${championsDataValues.length})`);
		for (const championData of championsDataValues) {
			await tx.run(`
				MERGE (champion:Champion { id: $id })
					ON CREATE SET 
						champion.name = $name, 
						champion.image = $image
			`, {
				id: int(championData.id),
				name: championData.name, 
				image: championData.image_url
			});

			await tx.run(`
				MATCH (champion:Champion { id: $championId })
				MERGE (champion)-[:has {key: "P"}]->(ability:Ability {
					key: "P", name: $name, description: $description, image: $image
				})
			`, {
				championId: int(championData.id),
				name: championData.passive.name, 
				description: championData.passive.description, 
				image: championData.passive.image_url
			});

			for (const spellData of championData.spells) {
				await tx.run(`
					MATCH (champion:Champion { id: $championId })
					MERGE (champion)-[:has {key: $key}]->(ability:Ability {
						key: $key, name: $name, description: $description, image: $image
					})
				`, {
					championId: int(championData.id),
					key: spellData.key,
					name: spellData.name, 
					description: spellData.description, 
					image: spellData.image_url,
				});
			}

			for (const skinData of championData.skins) {
				await tx.run(`
					MATCH (champion:Champion { id: $championId })
					MERGE (champion)-[:has]->(skin:Skin {
						id: $id, name: $name, image: $image
					})
				`, {
					championId: int(championData.id),
					id: int(skinData.id),
					name: skinData.name.charAt(0).toUpperCase() + skinData.name.slice(1), 
					image: skinData.centered_image
				});
			}
		}
	});

	await session.executeWrite(async (tx) => {
		console.log(`Adding summoner spells`)
		const spellsDataValues = Object.values(opggData.props.pageProps.data.spellsById) as any;
		for (const spellData of spellsDataValues) {
			await tx.run(`
				MERGE (spell:Spell { id: $id })
					ON CREATE SET
						spell.name = $name,
						spell.description = $description,
						spell.image = $image
			`, {
				id: int(spellData.id),
				name: spellData.name,
				description: spellData.description,
				image: spellData.image_url 
			});
		}

		console.log(`Adding rune pages`);
		const runePagesDataValues = Object.values(opggData.props.pageProps.data.runePagesById) as any;
		for (const runePageData of runePagesDataValues) {
			await tx.run(`
				MERGE (runePage:RunePage { id: $id })
					ON CREATE SET
						runePage.name = $name, 
						runePage.description = $description,
						runePage.slogan = $slogan,
						runePage.image = $image
			`, {
				id: int(runePageData.id),
				name: runePageData.name, 
				description: runePageData.description, 
				slogan: runePageData.slogan, 
				image: runePageData.image_url 
			});
		}

		console.log(`Adding runes`);
		const runesDataValues = Object.values(opggData.props.pageProps.data.runesById) as any;
		for (const runeData of runesDataValues) {
			await tx.run(`
				MATCH (page:RunePage { id: $pageId })
				MERGE (rune:Rune { id: $id })
					ON CREATE SET
						rune.name = $name, 
						rune.description = $description,
						rune.image = $image
				MERGE (page)-[:includes]->(rune)
				MERGE (rank)-[:belongsTo]->(page)
			`, {
				id: int(runeData.id),
				name: runeData.name,
				description: removeTags(runeData.short_desc),
				image: runeData.image_url,
				pageId: int(runeData.page_id),
			});
		}

		// TODO: runes excludes
	});

	await session.executeWrite(async (tx) => {
		console.log(`Adding items`);
		const itemsDataValues = Object.values(opggData.props.pageProps.data.itemsById) as any;
		for (const itemData of itemsDataValues) {
			await tx.run(`
				MERGE (item:Item { id: $id })
					ON CREATE SET
						item.name = $name, 
						item.shortDescription = $shortDescription,
						item.longDescription = $longDescription,
						item.image = $image,
						item.isMythic = $isMythic,
						item.purchasable = $purchasable,
						item.sellGoldValue = $sellGoldValue,
						item.totalGoldValue = $totalGoldValue,
						item.baseGoldValue = $baseGoldValue
			`, {
				id: int(itemData.id),
				name: itemData.name,
				shortDescription: itemData.plaintext,
				longDescription: removeTags(itemData.description),
				image: itemData.image_url,
				isMythic: itemData.is_mythic,
				purchasable: itemData.gold.purchasable,
				sellGoldValue: int(itemData.gold.sell),
				totalGoldValue: int(itemData.gold.total),
				baseGoldValue: int(itemData.gold.base),
			});
		}
		console.log(`Adding relations between items`);
		for (const itemData of itemsDataValues) {
			for (const otherId of (itemData.into_items || [])) {
				await tx.run(`
					MATCH (item:Item { id: $id })
					MATCH (otherItem:Item { id: $otherId })
					CREATE (item)-[:buildsInto]->(otherItem)
				`, {
					id: int(itemData.id), otherId: int(otherId),
				});
			}
			for (const otherId of (itemData.from_items || [])) {
				await tx.run(`
					MATCH (item:Item { id: $id })
					MATCH (otherItem:Item { id: $otherId })
					CREATE (item)-[:buildsFrom]->(otherItem)
				`, {
					id: int(itemData.id), otherId: int(otherId),
				});
			}
		}

		// TODO: item excludes (i.e. boots, mythics, trinkets)
	});

	await session.executeWrite(async (tx) => {
		console.log(`Adding ranks`);
		let previousName: string = '';
		for (const tier of rankTiers) {
			const capitalized = tier.charAt(0).toUpperCase() + tier.slice(1);
			for (let division = 1; division <= 4; division++) {
				const onlyOneDivision = (tier == 'MASTER' || tier == 'GRANDMASTER' || tier == 'CHALLENGER');
				if (onlyOneDivision && division > 1) continue;
				const name = onlyOneDivision ? capitalized : `${capitalized} ${division}`;
				await tx.run(`
					MERGE (rank:Rank { name: $name, tier: $tier, division: $division })
				`, { name, tier, division: int(division) });
				if (previousName) {
					await tx.run(`
						MATCH (previous:Rank { name: $previousName }), (rank:Rank { name: $name })
						MERGE (previous)-[:isWorseThan]->(rank)
						MERGE (rank)-[:isBetterThan]->(previous)
					`, { name, tier, division: int(division), previousName });
				}
				previousName = name;
			}
		}

		await tx.run(`MERGE (rank:Rank { name: 'Unranked', tier: 'UNRANKED', division: 1 })`)
	});
}

async function addPlayersData(cache: Cache, opggData:any, session: Session) {
	console.log(`Adding players (about ${cache._playersCacheMeta.size})`);
	let playersCounter = 0;
	for (const [name, meta] of cache._playersCacheMeta) {
		await session.executeWrite(async (tx) => {
			const playerData = await cache.getPlayerData(name);
			if (playerData) {
				console.debug(`Processing player '${name}' (last updated: ${meta.lastUpdatedAt}), with ${meta.gameIds.size} games`);
				const soloqStats = playerData.league_stats.find(x => x.queue_info.game_type == 'SOLORANKED')!;

				await tx.run(`
					OPTIONAL MATCH (rank:Rank { tier: $tier, division: $division })
					MERGE (player:Player { id: $id }) 
						ON CREATE SET 
							player.name = $name,
							player.level = $level,
							player.updatedAt = $updatedAt
					MERGE (player)-[:belongsTo { season: $season }]->(rank)
				`, {
					id: int(playerData.id),
					name: playerData.name,
					level: int(playerData.level),
					updatedAt: DateTime.fromStandardDate(new Date(playerData.updated_at)),
					season: new Date(playerData.lp_histories.at(-1)?.created_at || Date.now()).getFullYear().toString(),
					tier: soloqStats.tier_info.tier || 'UNRANKED',
					division: int(soloqStats.tier_info.division || 1),
				});

				for (const previousSeason of playerData.previous_seasons) {
					const seasonData = opggData.props.pageProps.data.seasons
						.find((x: any) => previousSeason.season_id === x.id)!;

					await tx.run(`
						MATCH (player:Player { id: $id }), (rank:Rank { tier: $tier, division: $division })
						MERGE (player)-[:belongsTo { season: $season }]->(rank)
					`, {
						id: int(playerData.id),
						season: seasonData.display_value.toString(),
						tier: previousSeason.tier_info.tier || 'UNRANKED',
						division: int(previousSeason.tier_info.division || 1),
					});
				}
			}
			else {
				// console.debug(`Processing player '${name}' (not fully updated), with ${meta.gameIds.size} related games`);
				await tx.run(`MERGE (player:Player { name: $name })`, { name: name });
			}
		});

		playersCounter += 1;
		if (playersCounter % 100 == 0) {
			console.debug(`Adding players... ${playersCounter} / ${cache._playersCacheMeta.size}`);
		}
	}
}

async function addGamesData(cache: Cache, session: Session) {
	console.log(`Adding games (about ${cache._cachedGames.size})`);
	let gamesCounter = 0;
	for (const gameId of cache._cachedGames) {
		const gameData = await cache.getGame(gameId);
		if (!gameData) {
			console.warn(`Missing game file, despite found in cache listing`);
			continue;
		}
		if (!gameData.participants.find(p => p.summoner.name == 'Azzapp')){
			// FIXME: for testing
			continue;
		}

		// console.debug(`Processing game started at ${new Date(gameData.created_at)}'`);

		await session.executeWrite(async (tx) => {
			await tx.run(`
				MATCH (rank:Rank { tier: $tier, division: $division})
				MERGE (game:Game { id: $id }) 
					ON CREATE SET 
						game.type = $type,
						game.createdAt = $createdAt,
						game.length = $length,
						game.version = $version,
						game.wasRemake = $wasRemake
				MERGE (game)-[:belongsTo]->(rank)
			`, {
				id: gameData.id, 
				type: gameData.queue_info.game_type, 
				createdAt: DateTime.fromStandardDate(new Date(gameData.created_at)),
				length: int(gameData.game_length_second),
				version: gameData.version,
				tier: gameData.average_tier_info.tier || 'UNRANKED',
				division: int(gameData.average_tier_info.division || 1),
				wasRemake: gameData.is_remake,
			});

			for (const teamData of gameData.teams) {
				await tx.run(`
					MATCH (game:Game { id: $gameId }) 
					CREATE (team:Team {
						key: $key, 
						victory: $victory,
						dragonKilled: $dragonKilled,
						baronKilled: $baronKilled,
						towerDestroyed: $towerDestroyed,
						kills: $kills,
						deaths: $deaths,
						assists: $assists,
						gold: $gold
					})
					MERGE (game)-[:playedBy]->(team)
					MERGE (team)-[:played]->(game)
				`, {
					gameId: gameData.id,
					key: teamData.key,
					victory: teamData.game_stat.is_win,
					dragonKilled: int(teamData.game_stat.dragon_kill),
					baronKilled: int(teamData.game_stat.baron_kill),
					towerDestroyed: int(teamData.game_stat.tower_kill),
					kills: int(teamData.game_stat.kill),
					deaths: int(teamData.game_stat.death),
					assists: int(teamData.game_stat.assist),
					gold: int(teamData.game_stat.gold_earned),
				});

				if (teamData.banned_champions.length < 5 || teamData.banned_champions.find(x => !x)) {
					debugger;
				}

				for (const bannedId of teamData.banned_champions) {
					if (!bannedId) continue;
					await tx.run(`
						MATCH 
							(game:Game { id: $gameId })-[:playedBy]->(team { key: $key }), 
							(champion:Champion { id: $bannedId })
						MERGE (team)-[:banned]->(champion)
					`, { gameId: gameData.id, key: teamData.key, bannedId: int(bannedId) });
				}
			}

			for (const participantData of gameData.participants) {
				// (player)-[:played]->(game), 
				// (game)-[:playedBy]->(player), 
				await tx.run(`
					MATCH 
						(game:Game { id: $gameId })-[:playedBy]->(team { key: $teamKey }),
						(player:Player { id: $playerId }),
						(champion:Champion { id: $championId }),
						(position:Position { key: $position }),
						(primaryRune:Rune { id: $primaryRuneId }),
						(primaryRunePage:RunePage { id: $primaryRunePageId }),
						(secondaryRunePage:RunePage { id: $secondaryRunePageId }),
						(a1stSpell:Spell { id: $a1stSpellId }),
						(a2ndSpell:Spell { id: $a2ndSpellId }),
						(trinket:Item { id: $trinketItemId }),
						(rank:Rank { tier: $tier, division: $division})
					CREATE 
						(performance:PlayerPerformance {
							position: $position,
							champion_level: $champion_level,
							damage_self_mitigated: $damage_self_mitigated,
							damage_dealt_to_objectives: $damage_dealt_to_objectives,
							damage_dealt_to_turrets: $damage_dealt_to_turrets,
							magic_damage_dealt_player: $magic_damage_dealt_player,
							physical_damage_taken: $physical_damage_taken,
							physical_damage_dealt_to_champions: $physical_damage_dealt_to_champions,
							total_damage_taken: $total_damage_taken,
							total_damage_dealt: $total_damage_dealt,
							total_damage_dealt_to_champions: $total_damage_dealt_to_champions,
							vision_score: $vision_score,
							vision_wards_bought_in_game: $vision_wards_bought_in_game,
							sight_wards_bought_in_game: $sight_wards_bought_in_game,
							ward_kill: $ward_kill,
							ward_place: $ward_place,
							turret_kill: $turret_kill,
							barrack_kill: $barrack_kill,
							kill: $kill,
							death: $death,
							assist: $assist,
							largest_multi_kill: $largest_multi_kill,
							largest_killing_spree: $largest_killing_spree,
							minion_kill: $minion_kill,
							neutral_minion_kill: $neutral_minion_kill,
							gold_earned: $gold_earned,
							total_heal: $total_heal,
							op_score: $op_score
						}), 
						(performance)-[:assignedAt]->(position),
						(team)-[:includes { position: $position }]->(performance), 
						(performance)-[:participated { position: $position }]->(team), 
						(player)-[:performed]->(performance), 
						(performance)-[:performedBy]->(player), 
						(performance)-[:summoned]->(champion),
						(performance)-[:used]->(primaryRune),
						(performance)-[:used]->(primaryRunePage),
						(performance)-[:used]->(secondaryRunePage),
						(performance)-[:used]->(a1stSpell),
						(performance)-[:used]->(a2ndSpell),
						(performance)-[:used]->(trinket),
						(performance)-[:belongsTo]->(rank)
				`, {
					gameId: gameData.id, 
					teamKey: participantData.team_key,
					playerId: int(participantData.summoner.id),
					championId: int(participantData.champion_id),

					position: participantData.position,
					champion_level:                     int(participantData.stats.champion_level),
					damage_self_mitigated:              int(participantData.stats.damage_self_mitigated),
					damage_dealt_to_objectives:         int(participantData.stats.damage_dealt_to_objectives),
					damage_dealt_to_turrets:            int(participantData.stats.damage_dealt_to_turrets),
					magic_damage_dealt_player:          int(participantData.stats.magic_damage_dealt_player),
					physical_damage_taken:              int(participantData.stats.physical_damage_taken),
					physical_damage_dealt_to_champions: int(participantData.stats.physical_damage_dealt_to_champions),
					total_damage_taken:                 int(participantData.stats.total_damage_taken),
					total_damage_dealt:                 int(participantData.stats.total_damage_dealt),
					total_damage_dealt_to_champions:    int(participantData.stats.total_damage_dealt_to_champions),
					vision_score:                       int(participantData.stats.vision_score),
					vision_wards_bought_in_game:        int(participantData.stats.vision_wards_bought_in_game),
					sight_wards_bought_in_game:         int(participantData.stats.sight_wards_bought_in_game),
					ward_kill:                          int(participantData.stats.ward_kill),
					ward_place:                         int(participantData.stats.ward_place),
					turret_kill:                        int(participantData.stats.turret_kill),
					barrack_kill:                       int(participantData.stats.barrack_kill),
					kill:                               int(participantData.stats.kill),
					death:                              int(participantData.stats.death),
					assist:                             int(participantData.stats.assist),
					largest_multi_kill:                 int(participantData.stats.largest_multi_kill),
					largest_killing_spree:              int(participantData.stats.largest_killing_spree),
					minion_kill:                        int(participantData.stats.minion_kill),
					neutral_minion_kill:                int(participantData.stats.neutral_minion_kill),
					gold_earned:                        int(participantData.stats.gold_earned),
					total_heal:                         int(participantData.stats.total_heal),
					op_score:                           participantData.stats.op_score,

					primaryRuneId: int(participantData.rune.primary_rune_id),
					primaryRunePageId: int(participantData.rune.primary_page_id),
					secondaryRunePageId: int(participantData.rune.secondary_page_id),
					a1stSpellId: int(participantData.spells[0]!),
					a2ndSpellId: int(participantData.spells[1]!),
					trinketItemId: int(participantData.trinket_item),
					tier: participantData.tier_info.tier || 'UNRANKED',
					division: int(participantData.tier_info.division || 1),
				});

				for (const itemId of participantData.items) {
					if (!itemId) continue;
					await tx.run(`
						MATCH 
							(game:Game { id: $gameId }),
							(player:Player { id: $playerId }),
							(game)-[:playedBy]->(team:Team)-[:includes]->(performance:PlayerPerformance)-[:performedBy]->(player)
						CREATE 
							(performance)-[:used]->(item:Item { id: $itemId })
					`, {
						gameId: gameData.id,
						playerId: int(participantData.summoner.id),
						itemId: int(itemId),
					});
				}
			}
		});

		gamesCounter += 1;
		if (gamesCounter % 10 == 0) {
			console.debug(`Adding games... ${gamesCounter} / ${cache._cachedGames.size}`);
		}
	}
}

export function registerNeo4jCommand(parent: Command) {
	const that = parent
		.command('neo4j')
		.addArgument(new Argument('<region>', `Region which cache should be exported to Neo4j database.`)
			.argParser(parseRegion))
		.description('Outputs local script cache to Neo4j database (university project requirement).')
		.addOption(new Option('-p, --parts [parts]', `Comma-separated list of: empty,opgg-static,players,games`)
			.default('empty,opgg-static,players,games'))
		.action(async (region: Region, options: any, command: Command) => {
			const parts = await parseSeparatedListOrLoadFromFile(options.parts, /,;:/g);

			const driver = neo4j.driver('neo4j://localhost', neo4j.auth.basic('neo4j', 'AAaa11!!'));
			await driver.verifyConnectivity();

			const cache = await getDefaultCache(region);
			const opggData = JSON.parse(await fs.readFile('data.json', 'utf-8'));
			
			const session = driver.session();
			try {
				if (parts.includes('empty')) {
					console.log(`Emptying the database`);
					await session.executeWrite(async (tx) => {
						await tx.run(`MATCH (x) DETACH DELETE x`);
					});
				}
				if (parts.includes('opgg-static')) {
					await addStaticData(opggData, session);
				}
				if (parts.includes('players')) {
					await addPlayersData(cache, opggData, session);
				}
				if (parts.includes('games')) {
					await addGamesData(cache, session);
				}
			}
			// catch (e) {
			// 	// Handle any errors
			// }
			finally {
				// Close the session & driver
				await session.close();
				await driver.close();
			}

			console.log('Done!');
		})
	;
	return that;
}

function removeTags(string: string) {
	return string.replace(/<\/?[^>]+(>|$)/g, "");
}
