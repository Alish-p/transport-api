export const TYRE_POSITIONS = {
    FRONT_1_LEFT_OUTER: 'Left Front Outer',
    FRONT_1_LEFT_INNER: 'Left Front Inner',
    FRONT_1_RIGHT_INNER: 'Right Front Inner',
    FRONT_1_RIGHT_OUTER: 'Right Front Outer',

    REAR_1_LEFT_OUTER: 'Left Rear First Outer',
    REAR_1_LEFT_INNER: 'Left Rear First Inner',
    REAR_1_RIGHT_INNER: 'Right Rear First Inner',
    REAR_1_RIGHT_OUTER: 'Right Rear First Outer',

    REAR_2_LEFT_OUTER: 'Left Rear Second Outer',
    REAR_2_LEFT_INNER: 'Left Rear Second Inner',
    REAR_2_RIGHT_INNER: 'Right Rear Second Inner',
    REAR_2_RIGHT_OUTER: 'Right Rear Second Outer',

    REAR_3_LEFT_OUTER: 'Left Rear Third Outer',
    REAR_3_LEFT_INNER: 'Left Rear Third Inner',
    REAR_3_RIGHT_INNER: 'Right Rear Third Inner',
    REAR_3_RIGHT_OUTER: 'Right Rear Third Outer',

    REAR_4_LEFT_OUTER: 'Left Rear Fourth Outer',
    REAR_4_LEFT_INNER: 'Left Rear Fourth Inner',
    REAR_4_RIGHT_INNER: 'Right Rear Fourth Inner',
    REAR_4_RIGHT_OUTER: 'Right Rear Fourth Outer',

    STEPNEY_1: 'Stepney Tyre First',
    STEPNEY_2: 'Stepney Tyre Second',
};

export const TYRE_LAYOUTS = [
    {
        id: '4-tyre',
        name: '4 Tyres (2 Front, 2 Rear)',
        tyres: [
            TYRE_POSITIONS.FRONT_1_LEFT_OUTER,
            TYRE_POSITIONS.FRONT_1_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_1_LEFT_OUTER,
            TYRE_POSITIONS.REAR_1_RIGHT_OUTER,
        ]
    },
    {
        id: '6-tyre',
        name: '6 Tyres (2 Axle)',
        tyres: [
            TYRE_POSITIONS.FRONT_1_LEFT_OUTER,
            TYRE_POSITIONS.FRONT_1_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_1_LEFT_OUTER,
            TYRE_POSITIONS.REAR_1_LEFT_INNER,
            TYRE_POSITIONS.REAR_1_RIGHT_INNER,
            TYRE_POSITIONS.REAR_1_RIGHT_OUTER,
        ]
    },
    {
        id: '10-tyre',
        name: '10 Tyres (3 Axle)',
        tyres: [
            TYRE_POSITIONS.FRONT_1_LEFT_OUTER,
            TYRE_POSITIONS.FRONT_1_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_1_LEFT_OUTER,
            TYRE_POSITIONS.REAR_1_LEFT_INNER,
            TYRE_POSITIONS.REAR_1_RIGHT_INNER,
            TYRE_POSITIONS.REAR_1_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_2_LEFT_OUTER,
            TYRE_POSITIONS.REAR_2_LEFT_INNER,
            TYRE_POSITIONS.REAR_2_RIGHT_INNER,
            TYRE_POSITIONS.REAR_2_RIGHT_OUTER,
            TYRE_POSITIONS.STEPNEY_1
        ]
    },
    {
        id: '12-tyre',
        name: '12 Tyres (4 Axle)',
        tyres: [
            TYRE_POSITIONS.FRONT_1_LEFT_OUTER,
            TYRE_POSITIONS.FRONT_1_LEFT_INNER,
            TYRE_POSITIONS.FRONT_1_RIGHT_INNER,
            TYRE_POSITIONS.FRONT_1_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_1_LEFT_OUTER,
            TYRE_POSITIONS.REAR_1_LEFT_INNER,
            TYRE_POSITIONS.REAR_1_RIGHT_INNER,
            TYRE_POSITIONS.REAR_1_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_2_LEFT_OUTER,
            TYRE_POSITIONS.REAR_2_LEFT_INNER,
            TYRE_POSITIONS.REAR_2_RIGHT_INNER,
            TYRE_POSITIONS.REAR_2_RIGHT_OUTER,
            TYRE_POSITIONS.STEPNEY_1
        ]
    },
    {
        id: '14-tyre',
        name: '14 Tyres (5 Axle)',
        tyres: [
            TYRE_POSITIONS.FRONT_1_LEFT_OUTER,
            TYRE_POSITIONS.FRONT_1_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_1_LEFT_OUTER,
            TYRE_POSITIONS.REAR_1_LEFT_INNER,
            TYRE_POSITIONS.REAR_1_RIGHT_INNER,
            TYRE_POSITIONS.REAR_1_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_2_LEFT_OUTER,
            TYRE_POSITIONS.REAR_2_LEFT_INNER,
            TYRE_POSITIONS.REAR_2_RIGHT_INNER,
            TYRE_POSITIONS.REAR_2_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_3_LEFT_OUTER,
            TYRE_POSITIONS.REAR_3_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_4_LEFT_OUTER,
            TYRE_POSITIONS.REAR_4_RIGHT_OUTER,
            TYRE_POSITIONS.STEPNEY_1,
            TYRE_POSITIONS.STEPNEY_2
        ]
    },

    {
        id: '16-tyre',
        name: '16 Tyres (6 Axle)',
        tyres: [
            TYRE_POSITIONS.FRONT_1_LEFT_OUTER,
            TYRE_POSITIONS.FRONT_1_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_1_LEFT_OUTER,
            TYRE_POSITIONS.REAR_1_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_2_LEFT_OUTER,
            TYRE_POSITIONS.REAR_2_LEFT_INNER,
            TYRE_POSITIONS.REAR_2_RIGHT_INNER,
            TYRE_POSITIONS.REAR_2_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_3_LEFT_OUTER,
            TYRE_POSITIONS.REAR_3_LEFT_INNER,
            TYRE_POSITIONS.REAR_3_RIGHT_INNER,
            TYRE_POSITIONS.REAR_3_RIGHT_OUTER,
            TYRE_POSITIONS.REAR_4_LEFT_OUTER,
            TYRE_POSITIONS.REAR_4_LEFT_INNER,
            TYRE_POSITIONS.REAR_4_RIGHT_INNER,
            TYRE_POSITIONS.REAR_4_RIGHT_OUTER,
            TYRE_POSITIONS.STEPNEY_1,
            TYRE_POSITIONS.STEPNEY_2
        ]
    }
];
