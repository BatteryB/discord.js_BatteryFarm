///////////////////
// 만들어야 할 것 //
///////////////////
// 1. 농작물 심기, 수확하기, 확인하기 (완성)
// 1-1. 습격중인 농장은 수확 안되게하기
// 2. 제사 (기우제 등등)
// 3. 전투 (두더지, 까마귀 등등), (현재 전투 발생 까지 제작)
// 4. 아이템 제작, 수리

import { ActionRowBuilder, Client, EmbedBuilder, GatewayIntentBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
dotenv.config({ path: 'env/token.env' });

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const db = new sqlite3.Database('db/gameDB.db');

const TOKEN = process.env.DISCORD_TOKEN;

const farmLate = setInterval(async () => {
    const stf = await new Promise(async (resolve, reject) => { // 씨앗의 자란 형태
        await db.all(`SELECT * FROM seedToFruit`, (err, rows) => resolve(rows));
    })

    const userFarm = await new Promise(async (resolve, reject) => { // 유저 농장
        await db.all(`SELECT * FROM userFarm`, (err, rows) => resolve(rows));
    })

    const nowDate = new Date();
    userFarm.forEach(async farm => {
        const user = client.users.fetch(farm.id);
        if (farm.lateDate == 'none') return;
        let lateDate = new Date(farm.lateDate);
        lateDate = lateDate - nowDate
        if (farm.battle == 0) {
            if (lateDate > 0) {
                if (Math.random() <= 0.0076) {
                    await db.run(`UPDATE userFarm SET battle = 1 WHERE farmId = ?`, [farm.farmId]);
                    (await user).send(`${farm.farmName}에서 침입이 발생했습니다!`)
                }
            } else {
                if (farm.fruit == 'none') {
                    const fruitName = stf.find(stf => farm.seed == stf.seed);
                    await db.run(`UPDATE userFarm SET lateDate = 'growth', fruit = ? WHERE farmId = ?`, [fruitName.fruit, farm.farmId]);
                    (await user).send(`${farm.farmName}의 "${farm.seed}"이(가) "${fruitName.fruit}"으로 자랐습니다!`)
                }
            }
        }
    });
}, 1000);

const rankOrder = ['E', 'D', 'C', 'B', 'A', 'S', 'EX', 'AT'];

client.on('ready', () => {
    console.log(client.user.tag);
});
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === '가입하기') {
        await interaction.deferReply({ ephemeral: true });
        if (!await joinCheck(interaction.user.id)) {
            await db.run(`INSERT INTO user(id) VALUES(?)`, [interaction.user.id]);
            await db.run(`INSERT INTO userStat(id) VALUES(?)`, [interaction.user.id]);
            for (let i = 1; i <= 5; i++) await db.run(`INSERT INTO userFarm(id, farmName) VALUES(?, ?)`, [interaction.user.id, `${interaction.user.globalName}의 농장_${i}`]);
            await userGainItem(interaction.user.id, 'money', 1000, 'money', 'join');
            await userGainItem(interaction.user.id, '시작의 괭이', 1, 'tool', 'join');
            await interaction.editReply('# 배터리팜 가입에 성공하셨습니다.\n\n*## 돈  +1000원\n## 시작의 괭이  +1*\n### ***__tip__*** **) 상점에서 "평범한 씨앗" 을 구입해서 심어보세요!**');
        } else {
            await interaction.editReply('이미 가입하셨습니다.');
        }
        return;
    }

    if (!await joinCheck(interaction.user.id)) {
        await interaction.reply({ content: '먼저 가입을 해주세요.', ephemeral: true });
        return;
    }

    if (interaction.commandName === '내정보') {
        await interaction.deferReply();

        let userInfo = await getUserInfo(interaction.user.id);
        let userStat = await getUserStat(interaction.user.id);

        const hpBar = '■'.repeat(userInfo.hp / 10);
        const staminaBar = '■'.repeat(userInfo.stamina / 5);

        const statKey = Object.keys(userStat);
        const statValue = Object.values(userStat);
        let stat = '\n====스탯====\n';
        for (let i = 1; i < statKey.length; i++) {
            stat += statKey[i] + ': ' + statValue[i] + '\n';
        }

        const itemInfo = await new Promise((resolve, reject) => {
            db.get(`SELECT i.itemName, i.rank FROM user u JOIN item i ON u.activeItem = i.itemName`, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });

        let userInfoEmbed = new EmbedBuilder()
            .setTitle('***배터리팜***')
            .setDescription(
                `**${interaction.user.globalName}**\n` +
                `${userInfo.level} 레벨\n` +
                '\n==체력==\n' + `(${userInfo.hp} / ${userInfo.maxHp} )\n` + hpBar + '\n' +
                '\n==기력==\n' + `( ${userInfo.stamina} / ${userInfo.maxStamina} )\n` + staminaBar + '\n' +
                `\n===돈===\n ${NumberConversion(userInfo.money)}원\n` +
                `\n====괭이====\n ${userInfo.activeItem != 'none' ? `${itemInfo.itemName} / ${itemInfo.rank}등급` : '*장착된 괭이 없음*'}\n` +
                stat
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();
        await interaction.editReply({ embeds: [userInfoEmbed] });
        return;
    }

    if (interaction.commandName === '상점') {
        await interaction.deferReply({ ephemeral: true });

        let way = interaction.options.getString('거래');
        let catalog = interaction.options.getString('품목');
        let amount = interaction.options.getNumber('갯수');

        if (way == '구매' && catalog == 'fruit') {
            await interaction.reply({ content: '열매는 구매가 가능한 품목이 아닙니다.' });
            return;
        }

        let userInfo = await getUserInfo(interaction.user.id);

        let itemData;
        if (way == '구매') {
            itemData = await getBuyItemData(catalog);
        } else {
            itemData = await userInventoryCatalogSelect(interaction.user.id, catalog);
            if (itemData.length <= 0) {
                await interaction.editReply({ content: '*판매가 가능한 아이템을 가지고있지 않습니다.*' });
                return;
            }
        }

        itemData.sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));

        let options = itemData.map(item =>
            new StringSelectMenuOptionBuilder()
                .setLabel(item.itemName)
                .setDescription(way == '구매'
                    ? `${item.rank}등급 / 구매가: ${NumberConversion(item.buyPrice)}원`
                    : `${item.rank}등급 / 판매가:${NumberConversion(item.salePrice)}원`)
                .setValue(item.itemName)
        )

        const select = new StringSelectMenuBuilder()
            .setCustomId('itemList')
            .setPlaceholder(way + ' 할 아이템을 선택하세요!')
            .addOptions(options);

        const row = new ActionRowBuilder()
            .addComponents(select);

        let response = await interaction.editReply({
            content: way + ' 할 아이템을 선택하세요!',
            components: [row],
        });

        const collectorFilter = i => i.user.id === interaction.user.id;

        try {
            const itemInteraction = await response.awaitMessageComponent({ filter: collectorFilter, time: 180_000 }); // 3분
            await interaction.editReply({ components: [] });

            const interactionItem = itemData.find(item => item.itemName == String(itemInteraction.values));

            if (way == "구매") {
                const requiredMoney = interactionItem.buyPrice * amount;
                if (userInfo.money < requiredMoney) {
                    await interaction.editReply({ content: `돈이 부족합니다.` });
                } else {
                    await userGainItem(interaction.user.id, interactionItem.itemName, amount, catalog, 'buy');
                    await userGainItem(interaction.user.id, 'money', -requiredMoney, 'money', 'buy');
                    await interaction.editReply({ content: `${interactionItem.itemName} ${amount}개\n구매성공!\n-${NumberConversion(requiredMoney)}원` });
                }
            } else {
                if (interactionItem.amount < amount) {
                    await interaction.editReply({ content: `아이템 갯수가 부족합니다.` });
                } else if (userInfo.activeItem == interactionItem.itemName && amount > 1) {
                    await interaction.editReply({ content: `현재 장착중인 괭이는 판매할 수 없습니다.` });
                } else {
                    await userGainItem(interaction.user.id, interactionItem.itemName, -amount, catalog, 'sale');
                    await userGainItem(interaction.user.id, 'money', interactionItem.salePrice * amount, 'money', 'sale');
                    await interaction.editReply({ content: `${interactionItem.itemName} ${amount}개\n판매성공!\n+${NumberConversion(interactionItem.salePrice * amount)}원` });
                }
            }
        } catch (e) {
            await interaction.editReply({ content: '3분동안 입력이 없어 취소되었습니다.', components: [] });
        }
        return;

    }

    if (interaction.commandName === '인벤') {
        await interaction.deferReply();

        let catalog = interaction.options.getString('품목');

        let userItemsObj = await new Promise((resolve, reject) => {
            db.all(`SELECT ui.itemName, ui.amount, i.rank FROM userInventory ui JOIN item i ON ui.itemName = i.itemName WHERE ui.id = ? AND ui.amount > 0 AND i.catalog = ?`, [interaction.user.id, catalog], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });

        let invenList = '';
        rankOrder.forEach(rank => {
            let itemList = userItemsObj.filter(item => item.rank === rank); // 등급 구별

            if (itemList.length > 0) {
                invenList += `***${rank}등급***\n`;

                itemList.forEach(item => {
                    invenList += `${item.itemName}: ${item.amount}개\n`;
                });

                invenList += '\n';
            }
        });

        if (invenList === '') {
            invenList = '***__인벤토리가 비었습니다.__***';
        }

        let invenEmbed = new EmbedBuilder()
            .setTitle(`${interaction.user.globalName}의 인벤토리`)
            .setDescription(invenList)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        await interaction.editReply({ embeds: [invenEmbed] });
    }

    if (interaction.commandName === '장착') {
        await interaction.deferReply({ ephemeral: true });

        let userInfo = await getUserInfo(interaction.user.id);
        let userStat = await getUserStat(interaction.user.id);
        let itemData = await userSelectTool(interaction.user.id);

        itemData.sort((a, b) => rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank));

        let options = itemData.map(item =>
            new StringSelectMenuOptionBuilder()
                .setLabel(item.itemName)
                .setDescription(`${item.itemName} ${item.rank}등급 / pow: ${NumberConversion(item.pow)} int: ${NumberConversion(item.int)} fai: ${NumberConversion(item.fai)}`)
                .setValue(item.itemName)
        );

        const select = new StringSelectMenuBuilder()
            .setCustomId('itemList')
            .setPlaceholder('장착할 괭이를 선택하세요!')
            .addOptions(options);

        const row = new ActionRowBuilder()
            .addComponents(select);

        let response = await interaction.editReply({
            content: '장착할 괭이를 선택하세요!',
            components: [row],
        });

        const collectorFilter = i => i.user.id === interaction.user.id;

        try {
            const itemInteraction = await response.awaitMessageComponent({ filter: collectorFilter, time: 180000 }); // 3분
            await interaction.editReply({ components: [] });

            const interactionTool = itemData.find(item => item.itemName === String(itemInteraction.values));

            if (userStat.pow < interactionTool.pow) {
                await interaction.editReply(`해당 아이템을 장착하기 위한 pow가 부족합니다.`);
            } else if (userStat.int < interactionTool.int) {
                await interaction.editReply(`해당 아이템을 장착하기 위한 int가 부족합니다.`);
            } else if (userStat.fai < interactionTool.fai) {
                await interaction.editReply(`해당 아이템을 장착하기 위한 fai가 부족합니다.`);
            } else {
                if (interactionTool.amount <= 0) {
                    await interaction.editReply(`${interactionTool.itemName} 의 갯수가 부족합니다.`);
                } else if (userInfo.activeItem === interactionTool.itemName) {
                    await db.run(`UPDATE user SET activeItem = 'none' WHERE id = ?`, [interaction.user.id]);
                    await interaction.editReply(`현재 장착중인 ${interactionTool.itemName} 을(를) 장착 해제 했습니다.`);
                } else {
                    await db.run(`UPDATE user SET activeItem = ? WHERE id = ?`, [interactionTool.itemName, interaction.user.id]);
                    await interaction.editReply(`${interactionTool.itemName} 을(를) 장착 했습니다.`);
                }
            }
        } catch (e) {
            await interaction.editReply({ content: '3분동안 입력이 없어 취소되었습니다.', components: [] });
        }
        return;
    }


    if (interaction.commandName === "농사") {
        const activity = interaction.options.getString('활동');        
        const userInfo = await getUserInfo(interaction.user.id)
        if(activity != '확인하기' && userInfo.activeItem == 'none') {
            await interaction.deferReply({ ephemeral: true })
            await interaction.editReply('괭이를 착용하지 않으셨습니다.');
            return;
        }

        activity == '심기' ? await interaction.deferReply({ ephemeral: true }) : await interaction.deferReply();

        let userFarm = await getUserFarm(interaction.user.id);
        if (activity == '확인하기') {
            let farmList = '';
            const nowDate = new Date();

            userFarm.forEach(farm => {
                farmList += `**${farm.farmName}**\n`;
                if (farm.seed == 'none') {
                    farmList += '*심은 씨앗 없음*'
                } else {
                    farmList += `*${farm.seed}*\n`

                    if (farm.battle == 1) {
                        farmList += `***__침입 발생!__***`
                    } else {
                        let lateDate = new Date(farm.lateDate);
                        lateDate = lateDate - nowDate;
                        if (lateDate > 0) {
                            farmList += `${formatTimeDifference(lateDate)} 남음`;
                        } else {
                            farmList += `***__수확 가능__***`
                        }
                    }
                }
                farmList += '\n\n'
            });

            const farmEmbed = new EmbedBuilder()
                .setTitle(`${interaction.user.globalName}의 농장`)
                .setDescription(farmList)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setTimestamp();

            await interaction.editReply({ embeds: [farmEmbed] })
        } else if (activity === '심기') {
            const options = userFarm.map(farm =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(farm.farmName)
                    .setDescription(farm.seed === 'none'
                        ? '심은 씨앗 없음'
                        : `${farm.seed}`)
                    .setValue(farm.farmName)
            );

            const select = new StringSelectMenuBuilder()
                .setCustomId('farmList')
                .setPlaceholder('씨앗을 심을 농장을 선택하세요!')
                .addOptions(options);

            const row = new ActionRowBuilder()
                .addComponents(select);

            const response = await interaction.editReply({
                content: '씨앗을 심을 농장을 선택하세요!',
                components: [row],
            });

            const seedList = await new Promise(async (resolve, reject) => { // 테이블 3개 조인
                await db.all(`SELECT si.itemName, si.amount, st.rank, sl.day, sl.hour, sl.min, sl.sec FROM userInventory si JOIN seedLate sl ON si.itemName = sl.seedName JOIN item st ON si.itemName = st.itemName WHERE si.id = ? AND st.catalog = "seed" AND si.amount > 0`, [interaction.user.id], (err, rows) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(rows)
                    }
                })
            })

            const collector = response.createMessageComponentCollector({ time: 180_000 });

            collector.on('end', async (collected, reason) => { // 콜렉터의 시간이 끝나면 실행
                if (reason == 'time') {
                    await interaction.editReply({ content: '3분동안 입력이 없어 취소되었습니다.', components: [] });
                }
            });

            let farmName;
            collector.on('collect', async i => {
                await interaction.editReply({ components: [] })

                if (i.customId == 'farmList') {
                    farmName = i.values;

                    const seedOptions = seedList.map(seed =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${seed.itemName}`)
                            .setDescription(`${seed.rank}등급 / 소요시간: ${selectTxt(seed)}`)
                            .setValue(seed.itemName)
                    );

                    const seedSelect = new StringSelectMenuBuilder()
                        .setCustomId('seedList')
                        .setPlaceholder('심을 씨앗을 선택하세요!')
                        .addOptions(seedOptions);

                    const seedRow = new ActionRowBuilder()
                        .addComponents(seedSelect);

                    const seedResponse = await interaction.editReply({
                        content: `**심을 씨앗을 선택하세요!**\n__\`상호작용 실패\`__ *가 나타날 때 까지 __기다렸다가__ 씨앗을 골라주세요.*`,
                        components: [seedRow],
                    });

                } else if (i.customId == 'seedList') {
                    const seed = seedList.find(seed => seed.itemName == i.values);

                    let seedIf = false
                    userFarm.forEach(farm => {
                        if (seedIf == true) return;
                        if (farm.seed == seed.itemName) seedIf = true;
                    });

                    if (seedIf == true) {
                        await interaction.editReply(`해당 씨앗은 이미 다른 농장에 심으셨습니다.`);
                        return;
                    }
                    const nowDate = new Date();
                    let lateDate = new Date();
                    lateDate.setDate(lateDate.getDate() + seed.day);
                    lateDate.setHours(lateDate.getHours() + seed.hour);
                    lateDate.setMinutes(lateDate.getMinutes() + seed.min);
                    lateDate.setSeconds(lateDate.getSeconds() + seed.sec);

                    lateDate = formatDate(lateDate);

                    await db.run(`UPDATE userFarm SET seed = ?, fruit = 'none', lateDate = ? WHERE farmName = ? AND id = ? `, [seed.itemName, lateDate, farmName[0], interaction.user.id]);
                    await interaction.editReply({ content: `${farmName} 에 ${seed.itemName}을(를) 심으셨습니다.`, components: [] })

                    await userGainItem(interaction.user.id, seed.itemName, -1, 'seed', 'planting seed')
                    collector.stop()
                }
            });
        } else if (activity === '수확하기') {
            let harvList = ''
            for (const farm of userFarm) {
                if (farm.fruit == 'none') continue;
                await userGainItem(interaction.user.id, farm.fruit, 1, 'fruit', 'harvest');
                await db.run(`UPDATE userFarm SET seed = 'none', fruit = 'none', lateDate = 'none' WHERE farmId = ?`, [farm.farmId]);
                harvList += farm.fruit + ' +1\n';
            }

            if (harvList == '') {
                await interaction.editReply(`수확을 할 수 있는 농장이 없습니다.`);
                return;
            }
            await interaction.editReply(`${interaction.user.globalName}님이 열매를 수확했습니다.\n\n *${harvList}*`);
        }
        return;
    }

    if (interaction.commandName === "제사") {
        // 이제 여기 해야됨
    }
});

function NumberConversion(Num) { // 숫자 변환 예) 100000 => 100,000
    return Num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function joinCheck(id) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM user WHERE id = ?", [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(!!row);
            }
        });
    });
};

function selectTxt(seed) {
    let txt = '';
    if (seed.day > 0) txt += `${seed.day}일 `;
    if (seed.hour > 0) txt += `${seed.hour}시간 `;
    if (seed.min > 0) txt += `${seed.min}분 `;
    if (seed.sec > 0) txt += `${seed.sec}초`;
    return txt.trim(); // 문자열 반환
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatTimeDifference(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;

    let result = '';
    if (days > 0) result += `${days}일 `;
    if (remainingHours > 0) result += `${remainingHours}시간 `;
    if (remainingMinutes > 0) result += `${remainingMinutes}분 `;
    if (remainingSeconds > 0) result += `${remainingSeconds}초`;

    return result.trim();
}

async function getUserInfo(id) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM user WHERE id = ?", [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

async function getUserStat(id) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM userStat WHERE id = ?", [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

async function userInventoryCheck(id, itemName) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM userInventory WHERE id = ? AND itemName = ?", [id, itemName], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(!!row);
            }
        });
    });
};

async function userInventoryCatalogSelect(id, catalog) {
    return new Promise((resolve, reject) => {
        db.all("SELECT ui.itemName, ui.amount, id.rank, id.salePrice, id.catalog FROM userInventory ui INNER JOIN item id ON ui.itemName = id.itemName WHERE ui.id = ? AND ui.amount > 0 AND id.catalog = ? AND id.saleYn = 'Y'", [id, catalog], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

async function userSelectTool(id) {
    return new Promise((resolve, reject) => {
        db.all("SELECT ui.itemName, ui.amount, id.rank, id.pow, id.int, id.fai FROM userInventory ui INNER JOIN item id ON ui.itemName = id.itemName WHERE ui.id = ? AND ui.amount > 0 AND id.catalog = 'tool'", [id], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

async function userGainItem(id, itemName, amount, catalog, actionReason) {
    const actionType = amount > 0 ? 'gain' : 'lose';
    await db.run(`INSERT INTO gainItemLog(id, itemName, amount, catalog, actionType, actionReason) VALUES(?, ?, ?, ?, ?, ?)`, [id, itemName, amount, catalog, actionType, actionReason]);
    if (itemName == "money") {
        await db.run(`UPDATE user SET money = money + ? WHERE id = ?`, [amount, id]);
    } else {
        if (await userInventoryCheck(id, itemName)) {
            await db.run(`UPDATE userInventory SET amount = amount + ? WHERE id = ? AND itemName = ?`, [amount, id, itemName]);
        } else {
            await db.run(`INSERT INTO userInventory(id, itemName, amount, catalog) VALUES(?, ?, ?, ?)`, [id, itemName, amount, catalog]);
        }
    }
}

async function getUserFarm(id) {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM userFarm WHERE id = ? ORDER BY farmName", [id], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};


// DATA
async function getBuyItemData(catalog) {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM item WHERE catalog = ? AND buyYn = 'Y'", [catalog], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

async function getItemData(catalog) {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM item WHERE catalog = ?", [catalog], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

client.login(TOKEN);