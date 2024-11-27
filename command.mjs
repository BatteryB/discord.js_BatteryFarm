import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';

dotenv.config({ path: 'env/token.env' });

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

const catalog = [
    {
        name: '도구',
        value: 'tool'
    },
    {
        name: '씨앗',
        value: 'seed'
    },
    {
        name: '열매',
        value: 'fruit'
    }
]

const commands = [
    {
        name: '가입하기',
        description: '배터리팜에 가입합니다.',
    },
    {
        name: '내정보',
        description: '자신의 배터리팜 정보를 확인합니다.'
    },
    {
        name: '상점',
        description: '상점에서 아이템을 구입하거나 판매합니다.',
        options: [
            {
                name: '거래',
                description: "상점 아이템의 거래를 선택합니다.",
                type: 3,
                required: true,
                choices: [
                    {
                        name: '구매',
                        value: '구매'
                    },
                    {
                        name: '판매',
                        value: '판매'
                    }
                ]
            },
            {
                name: '품목',
                description: "상점 아이템의 품목을 선택합니다.",
                type: 3,
                required: true,
                choices: catalog
            },
            {
                name: '갯수',
                description: "상점 아이템의 거래 갯수를 선택합니다.",
                type: 10,
                required: true,
            },
        ]
    },
    {
        name: '인벤',
        description: '자신의 배터리팜 인벤토리를 확인합니다.',
        options: [
            {
                name: '품목',
                description: "인벤토리의 품목을 선택합니다.",
                type: 3,
                required: true,
                choices: catalog
            },
        ]
    },
    {
        name: '장착',
        description: '괭이를 장착합니다. (현재 장착중인 괭이를 선택하면 장착이 해제됩니다.)'
    },
    {
        name: '농사',
        description: '농사를 합니다.',
        options: [
            {
                name: '활동',
                description: "어떤 활동을 할지 지정합니다.",
                type: 3,
                required: true,
                choices: [
                    {
                        name: '심기',
                        value: '심기'
                    },
                    {
                        name: '수확하기',
                        value: '수확하기'
                    },
                    {
                        name: '확인하기',
                        value: '확인하기'
                    },
                    {
                        name: '포기하기',
                        value: '포기하기'
                    }
                ]
            },
        ]
    },
    {
        name: '제사',
        description: '농사를 위한 제사를 지냅니다.'
    },
    {
        name: '전투',
        description: '습격에 대응합니다.'
    },
    {
        name: '',
        description: ''
    }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

    console.log('Successfully reloaded application (/) commands.');
} catch (error) {
    console.error(error);
}
