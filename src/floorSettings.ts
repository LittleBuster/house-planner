export const FLOOR_KINDS = [
  {id:"parquet",name:"Паркет"},
  {id:"tile60",name:"Керамогранит 60 × 60"},
  {id:"tile120",name:"Керамогранит 60 × 120"},
  {id:"linoleum",name:"Линолеум"},
] as const;

export type FloorKind = typeof FLOOR_KINDS[number]["id"];
export const FLOOR_ANGLES = [0,45,90,135] as const;
export type FloorAngle = typeof FLOOR_ANGLES[number];
export type FloorFinish = {kind: FloorKind; texture: string; color: string; angle: FloorAngle};
export type RoomFloor = {roomId: string; finish: FloorFinish};

const woodColors = [
  {id:"light-oak",name:"Светлый дуб",color:"#d8b88a"},
  {id:"natural-oak",name:"Натуральный дуб",color:"#b98450"},
  {id:"walnut",name:"Орех",color:"#815b46"},
  {id:"ash-gray",name:"Серый ясень",color:"#a49c90"},
];
const solidColors = [
  {id:"light-gray",name:"Светло-серый",color:"#c1c2c2"},
  {id:"white",name:"Белый",color:"#ecebe6"},
  {id:"beige",name:"Бежевый",color:"#ccbaa5"},
  {id:"graphite",name:"Графитовый",color:"#666a6e"},
];
const tileOptions = {
  colors:solidColors,
  textures:[
    {id:"plain",name:"Однотонный матовый"},
    {id:"concrete",name:"Матовый бетон"},
    {id:"stone",name:"Матовый камень"},
  ],
};
export const FLOOR_OPTIONS = {
  parquet:{
    colors:woodColors,
    textures:[
      {id:"fine-grain",name:"Тонкое волокно"},
      {id:"rustic",name:"Древесина с сучками"},
      {id:"brushed",name:"Брашированная древесина"},
    ],
  },
  tile60:tileOptions,
  tile120:tileOptions,
  linoleum:{
    colors:solidColors,
    textures:[
      {id:"plain",name:"Однотонный"},
      {id:"speckled",name:"Крапинка"},
      {id:"woven",name:"Под текстиль"},
    ],
  },
};

export function defaultFloor(kind: FloorKind): FloorFinish {
  const options = FLOOR_OPTIONS[kind];
  return {kind,texture:options.textures[0].id,color:options.colors[0].id,angle:0};
}

export function validFloorFinish(value: unknown): value is FloorFinish {
  const floor = value as FloorFinish;
  if (!floor || !FLOOR_KINDS.some(item => item.id === floor.kind)) return false;
  const options = FLOOR_OPTIONS[floor.kind];
  return options.textures.some(item => item.id === floor.texture) &&
    options.colors.some(item => item.id === floor.color) && FLOOR_ANGLES.includes(floor.angle);
}
