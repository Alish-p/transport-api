export const TYRE_POSITIONS = {
    AXLE_1_LEFT_OUTER: 'Axle-1 Left Outer',
    AXLE_1_LEFT_INNER: 'Axle-1 Left Inner',
    AXLE_1_RIGHT_INNER: 'Axle-1 Right Inner',
    AXLE_1_RIGHT_OUTER: 'Axle-1 Right Outer',

    AXLE_2_LEFT_OUTER: 'Axle-2 Left Outer',
    AXLE_2_LEFT_INNER: 'Axle-2 Left Inner',
    AXLE_2_RIGHT_INNER: 'Axle-2 Right Inner',
    AXLE_2_RIGHT_OUTER: 'Axle-2 Right Outer',

    AXLE_3_LEFT_OUTER: 'Axle-3 Left Outer',
    AXLE_3_LEFT_INNER: 'Axle-3 Left Inner',
    AXLE_3_RIGHT_INNER: 'Axle-3 Right Inner',
    AXLE_3_RIGHT_OUTER: 'Axle-3 Right Outer',

    AXLE_4_LEFT_OUTER: 'Axle-4 Left Outer',
    AXLE_4_LEFT_INNER: 'Axle-4 Left Inner',
    AXLE_4_RIGHT_INNER: 'Axle-4 Right Inner',
    AXLE_4_RIGHT_OUTER: 'Axle-4 Right Outer',

    AXLE_5_LEFT_OUTER: 'Axle-5 Left Outer',
    AXLE_5_LEFT_INNER: 'Axle-5 Left Inner',
    AXLE_5_RIGHT_INNER: 'Axle-5 Right Inner',
    AXLE_5_RIGHT_OUTER: 'Axle-5 Right Outer',

    STEPNEY_1: 'Stepney Tyre First',
    STEPNEY_2: 'Stepney Tyre Second',
};

export const TYRE_LAYOUTS = [
    {
        id: '4-tyre',
        name: '4 Tyres (2 Front, 2 Rear)',
        tyres: [
            TYRE_POSITIONS.AXLE_1_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_1_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_2_RIGHT_OUTER,
        ]
    },
    {
        id: '6-tyre',
        name: '6 Tyres (2 Axle)',
        tyres: [
            TYRE_POSITIONS.AXLE_1_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_1_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_INNER,
            TYRE_POSITIONS.AXLE_2_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_2_RIGHT_OUTER,
        ]
    },
    {
        id: '10-tyre',
        name: '10 Tyres (3 Axle)',
        tyres: [
            TYRE_POSITIONS.AXLE_1_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_1_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_INNER,
            TYRE_POSITIONS.AXLE_2_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_2_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_INNER,
            TYRE_POSITIONS.AXLE_3_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_3_RIGHT_OUTER,
            TYRE_POSITIONS.STEPNEY_1
        ]
    },
    {
        id: '12-tyre-1',
        name: '12 Tyres (3 Axle)',
        tyres: [
            TYRE_POSITIONS.AXLE_1_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_1_LEFT_INNER,
            TYRE_POSITIONS.AXLE_1_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_1_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_INNER,
            TYRE_POSITIONS.AXLE_2_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_2_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_INNER,
            TYRE_POSITIONS.AXLE_3_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_3_RIGHT_OUTER,
            TYRE_POSITIONS.STEPNEY_1
        ]
    },
    {
        id: '12-tyre-2',
        name: '12 Tyres (4 Axle)',
        showName: '12 Tyres (4 Axle)',
        tyres: [
            TYRE_POSITIONS.AXLE_1_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_1_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_2_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_INNER,
            TYRE_POSITIONS.AXLE_3_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_3_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_4_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_4_LEFT_INNER,
            TYRE_POSITIONS.AXLE_4_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_4_RIGHT_OUTER,
            TYRE_POSITIONS.STEPNEY_1
        ]
    },
    {
        id: '14-tyre-1',
        name: '14 Tyres (5 Axle) 1',
        tyres: [
            TYRE_POSITIONS.AXLE_1_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_1_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_INNER,
            TYRE_POSITIONS.AXLE_2_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_2_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_INNER,
            TYRE_POSITIONS.AXLE_3_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_3_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_4_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_4_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_5_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_5_RIGHT_OUTER,
            TYRE_POSITIONS.STEPNEY_1,
            TYRE_POSITIONS.STEPNEY_2
        ]
    },
    {
        id: '14-tyre-2',
        name: '14 Tyres (5 Axle) 2',
        tyres: [
            TYRE_POSITIONS.AXLE_1_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_1_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_2_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_3_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_4_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_4_LEFT_INNER,
            TYRE_POSITIONS.AXLE_4_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_4_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_5_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_5_LEFT_INNER,
            TYRE_POSITIONS.AXLE_5_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_5_RIGHT_OUTER,
            TYRE_POSITIONS.STEPNEY_1,
            TYRE_POSITIONS.STEPNEY_2
        ]
    },

    {
        id: '16-tyre',
        name: '16 Tyres (6 Axle)',
        tyres: [
            TYRE_POSITIONS.AXLE_1_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_1_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_2_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_2_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_3_LEFT_INNER,
            TYRE_POSITIONS.AXLE_3_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_3_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_4_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_4_LEFT_INNER,
            TYRE_POSITIONS.AXLE_4_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_4_RIGHT_OUTER,
            TYRE_POSITIONS.AXLE_5_LEFT_OUTER,
            TYRE_POSITIONS.AXLE_5_LEFT_INNER,
            TYRE_POSITIONS.AXLE_5_RIGHT_INNER,
            TYRE_POSITIONS.AXLE_5_RIGHT_OUTER,
            TYRE_POSITIONS.STEPNEY_1,
            TYRE_POSITIONS.STEPNEY_2
        ]
    }
];

