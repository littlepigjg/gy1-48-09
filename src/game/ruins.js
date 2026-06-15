import {
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SURFACE_Y,
  TILE_TYPES,
  TILE_HARDNESS,
  RUINS_SPAWN_CONFIG,
  TRAP_DAMAGE,
  LEGENDARY_ORE_PRICES,
  LEGENDARY_ORE_NAMES,
  BLUEPRINT_TYPES,
  BLUEPRINT_NAMES
} from './constants.js';

export class Ruin {
  constructor(x, y, width, height, depthLevel) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.depthLevel = depthLevel;
    this.rooms = [];
    this.chests = [];
    this.traps = [];
    this.guardians = [];
    this.pressurePlates = [];
    this.doors = [];
    this.exploredTiles = new Set();
    this.totalTiles = 0;
    this.discovered = false;
    this.completed = false;
    this.completionBonusClaimed = false;
    this.torchPositions = [];
    this.altarPosition = null;
  }

  get explorationProgress() {
    if (this.totalTiles === 0) return 0;
    return this.exploredTiles.size / this.totalTiles;
  }

  isInside(tileX, tileY) {
    return tileX >= this.x && tileX < this.x + this.width &&
           tileY >= this.y && tileY < this.y + this.height;
  }

  addExploredTile(tileX, tileY) {
    if (this.isInside(tileX, tileY)) {
      const key = `${tileX},${tileY}`;
      this.exploredTiles.add(key);
      if (this.explorationProgress >= 0.9 && !this.completed) {
        this.completed = true;
        return true;
      }
    }
    return false;
  }
}

export class RuinGenerator {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.random = this.mulberry32(seed);
  }

  mulberry32(a) {
    return function() {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  nextInt(min, max) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  pick(array) {
    return array[Math.floor(this.random() * array.length)];
  }

  generateRuin(startX, startY, depthLevel) {
    const minSize = RUINS_SPAWN_CONFIG.minSize + Math.floor(depthLevel * 0.02);
    const maxSize = RUINS_SPAWN_CONFIG.maxSize + Math.floor(depthLevel * 0.05);
    const width = this.nextInt(minSize, maxSize);
    const height = this.nextInt(minSize, maxSize);

    const ruin = new Ruin(startX, startY, width, height, depthLevel);

    const numRooms = this.nextInt(
      RUINS_SPAWN_CONFIG.minRooms,
      RUINS_SPAWN_CONFIG.maxRooms
    );

    this.generateRooms(ruin, numRooms);
    this.generateCorridors(ruin);
    this.addWalls(ruin);
    this.addDecorations(ruin);
    this.addTraps(ruin);
    this.addChests(ruin);
    this.addGuardians(ruin);
    this.addPressurePlates(ruin);
    this.addDoors(ruin);
    this.calculateTotalTiles(ruin);

    return ruin;
  }

  generateRooms(ruin, numRooms) {
    const attempts = numRooms * 3;
    const rooms = [];

    for (let i = 0; i < attempts && rooms.length < numRooms; i++) {
      const roomMinW = 4;
      const roomMaxW = Math.min(10, Math.floor(ruin.width * 0.6));
      const roomMinH = 4;
      const roomMaxH = Math.min(8, Math.floor(ruin.height * 0.6));

      const roomW = this.nextInt(roomMinW, roomMaxW);
      const roomH = this.nextInt(roomMinH, roomMaxH);
      const roomX = this.nextInt(1, ruin.width - roomW - 1);
      const roomY = this.nextInt(1, ruin.height - roomH - 1);

      const newRoom = { x: roomX, y: roomY, width: roomW, height: roomH };
      let overlaps = false;

      for (const room of rooms) {
        if (this.roomsOverlap(newRoom, room, 2)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        rooms.push(newRoom);
      }
    }

    ruin.rooms = rooms;
  }

  roomsOverlap(a, b, padding = 0) {
    return !(a.x + a.width + padding < b.x ||
             b.x + b.width + padding < a.x ||
             a.y + a.height + padding < b.y ||
             b.y + b.height + padding < a.y);
  }

  generateCorridors(ruin) {
    const rooms = [...ruin.rooms];
    for (let i = 1; i < rooms.length; i++) {
      const roomA = rooms[i - 1];
      const roomB = rooms[i];

      const ax = Math.floor(roomA.x + roomA.width / 2);
      const ay = Math.floor(roomA.y + roomA.height / 2);
      const bx = Math.floor(roomB.x + roomB.width / 2);
      const by = Math.floor(roomB.y + roomB.height / 2);

      if (this.random() < 0.5) {
        this.createHCorridor(ruin, ax, bx, ay);
        this.createVCorridor(ruin, ay, by, bx);
      } else {
        this.createVCorridor(ruin, ay, by, ax);
        this.createHCorridor(ruin, ax, bx, by);
      }
    }
  }

  createHCorridor(ruin, x1, x2, y) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
      this.carveTile(ruin, x, y);
      if (y > 0) this.carveTile(ruin, x, y - 1);
    }
  }

  createVCorridor(ruin, y1, y2, x) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
      this.carveTile(ruin, x, y);
      if (x > 0) this.carveTile(ruin, x - 1, y);
    }
  }

  carveTile(ruin, localX, localY) {
    if (localX < 0 || localX >= ruin.width || localY < 0 || localY >= ruin.height) {
      return false;
    }
    return true;
  }

  addWalls(ruin) {
  }

  addDecorations(ruin) {
    for (const room of ruin.rooms) {
      const pillarCount = this.nextInt(0, 2);
      for (let i = 0; i < pillarCount; i++) {
        const px = room.x + this.nextInt(1, room.width - 2);
        const py = room.y + this.nextInt(1, room.height - 2);
        ruin.torchPositions.push({ x: px, y: py });
      }

      const torchSides = ['top', 'bottom', 'left', 'right'];
      const torchCount = this.nextInt(1, 3);
      for (let i = 0; i < torchCount; i++) {
        const side = this.pick(torchSides);
        let tx, ty;
        switch (side) {
          case 'top':
            tx = room.x + this.nextInt(1, room.width - 2);
            ty = room.y + 1;
            break;
          case 'bottom':
            tx = room.x + this.nextInt(1, room.width - 2);
            ty = room.y + room.height - 2;
            break;
          case 'left':
            tx = room.x + 1;
            ty = room.y + this.nextInt(1, room.height - 2);
            break;
          case 'right':
            tx = room.x + room.width - 2;
            ty = room.y + this.nextInt(1, room.height - 2);
            break;
        }
        ruin.torchPositions.push({ x: tx, y: ty, isWall: true });
      }
    }

    if (ruin.rooms.length > 0) {
      const altarRoom = ruin.rooms[Math.floor(ruin.rooms.length / 2)];
      ruin.altarPosition = {
        x: altarRoom.x + Math.floor(altarRoom.width / 2),
        y: altarRoom.y + Math.floor(altarRoom.height / 2)
      };
    }
  }

  addTraps(ruin) {
    const trapCount = this.nextInt(2, 4 + Math.floor(ruin.depthLevel / 50));
    const trapTypes = ['spike', 'poison', 'fire', 'arrow'];

    for (let i = 0; i < trapCount; i++) {
      const room = this.pick(ruin.rooms);
      if (!room) continue;

      const tx = room.x + this.nextInt(1, room.width - 2);
      const ty = room.y + this.nextInt(1, room.height - 2);
      const type = this.pick(trapTypes);

      ruin.traps.push({
        x: tx,
        y: ty,
        type: type,
        triggered: false,
        damage: TRAP_DAMAGE[type] || 10,
        cooldown: 0
      });
    }
  }

  addChests(ruin) {
    const chestCount = this.nextInt(2, 3 + Math.floor(ruin.depthLevel / 100));

    for (let i = 0; i < chestCount; i++) {
      const roomIdx = i % ruin.rooms.length;
      const room = ruin.rooms[roomIdx];
      if (!room) continue;

      const cx = room.x + this.nextInt(1, room.width - 2);
      const cy = room.y + this.nextInt(1, room.height - 2);

      const loot = this.generateChestLoot(ruin.depthLevel);

      ruin.chests.push({
        x: cx,
        y: cy,
        opened: false,
        loot: loot
      });
    }
  }

  generateChestLoot(depthLevel) {
    const loot = {
      gold: this.nextInt(50, 200 + depthLevel * 2),
      ores: {},
      blueprints: []
    };

    const legendaryOres = Object.keys(LEGENDARY_ORE_PRICES);
    const oreCount = this.nextInt(1, 3);
    for (let i = 0; i < oreCount; i++) {
      const oreType = this.pick(legendaryOres);
      const amount = this.nextInt(1, 3 + Math.floor(depthLevel / 80));
      loot.ores[oreType] = (loot.ores[oreType] || 0) + amount;
    }

    if (this.random() < 0.3 + depthLevel * 0.002) {
      const blueprintTypes = Object.values(BLUEPRINT_TYPES);
      loot.blueprints.push(this.pick(blueprintTypes));
    }

    return loot;
  }

  addGuardians(ruin) {
    const guardianCount = this.nextInt(1, 2 + Math.floor(ruin.depthLevel / 100));
    const guardianTypes = ['stone_guardian', 'ancient_wraith', 'golden_golem'];

    for (let i = 0; i < guardianCount; i++) {
      const room = this.pick(ruin.rooms);
      if (!room) continue;

      const gx = (room.x + room.width / 2) * TILE_SIZE;
      const gy = (room.y + room.height / 2) * TILE_SIZE;
      const type = this.pick(guardianTypes);

      ruin.guardians.push({
        type: type,
        x: gx,
        y: gy,
        localRoomX: room.x,
        localRoomY: room.y,
        roomWidth: room.width,
        roomHeight: room.height,
        health: this.getGuardianHealth(type, ruin.depthLevel),
        maxHealth: this.getGuardianHealth(type, ruin.depthLevel),
        damage: this.getGuardianDamage(type, ruin.depthLevel),
        speed: this.getGuardianSpeed(type),
        color: this.getGuardianColor(type),
        size: 1.2,
        gold: this.getGuardianGold(type, ruin.depthLevel),
        awakened: false,
        vx: 0,
        vy: 0,
        damageFlash: 0,
        aiTimer: 0,
        aiDir: { x: 0, y: 0 }
      });
    }
  }

  getGuardianHealth(type, depthLevel) {
    const base = {
      stone_guardian: 80,
      ancient_wraith: 60,
      golden_golem: 150
    };
    return (base[type] || 80) + depthLevel * 0.5;
  }

  getGuardianDamage(type, depthLevel) {
    const base = {
      stone_guardian: 12,
      ancient_wraith: 8,
      golden_golem: 20
    };
    return (base[type] || 12) + depthLevel * 0.1;
  }

  getGuardianSpeed(type) {
    const base = {
      stone_guardian: 0.8,
      ancient_wraith: 2.0,
      golden_golem: 0.5
    };
    return base[type] || 1.0;
  }

  getGuardianColor(type) {
    const colors = {
      stone_guardian: '#696969',
      ancient_wraith: '#9370DB',
      golden_golem: '#FFD700'
    };
    return colors[type] || '#696969';
  }

  getGuardianGold(type, depthLevel) {
    const base = {
      stone_guardian: 50,
      ancient_wraith: 80,
      golden_golem: 200
    };
    return (base[type] || 50) + depthLevel;
  }

  addPressurePlates(ruin) {
    if (ruin.rooms.length < 2) return;

    const plateCount = this.nextInt(1, 2);
    for (let i = 0; i < plateCount; i++) {
      const room = this.pick(ruin.rooms);
      if (!room) continue;

      const px = room.x + this.nextInt(1, room.width - 2);
      const py = room.y + this.nextInt(1, room.height - 2);

      ruin.pressurePlates.push({
        x: px,
        y: py,
        activated: false,
        linkedDoorIndex: i % ruin.doors.length
      });
    }
  }

  addDoors(ruin) {
    for (let i = 0; i < ruin.rooms.length - 1; i++) {
      const room = ruin.rooms[i];
      if (!room) continue;

      const doorSides = ['left', 'right', 'top', 'bottom'];
      const side = this.pick(doorSides);
      let dx, dy;

      switch (side) {
        case 'left':
          dx = room.x;
          dy = room.y + Math.floor(room.height / 2);
          break;
        case 'right':
          dx = room.x + room.width - 1;
          dy = room.y + Math.floor(room.height / 2);
          break;
        case 'top':
          dx = room.x + Math.floor(room.width / 2);
          dy = room.y;
          break;
        case 'bottom':
          dx = room.x + Math.floor(room.width / 2);
          dy = room.y + room.height - 1;
          break;
      }

      ruin.doors.push({
        x: dx,
        y: dy,
        open: false,
        locked: this.random() < 0.3
      });
    }
  }

  calculateTotalTiles(ruin) {
    let count = 0;
    for (const room of ruin.rooms) {
      count += room.width * room.height;
    }
    ruin.totalTiles = count;
  }
}

export class RuinManager {
  constructor() {
    this.ruins = [];
    this.generator = new RuinGenerator(Date.now());
  }

  clear() {
    this.ruins = [];
  }

  getRuinAt(tileX, tileY) {
    for (const ruin of this.ruins) {
      if (ruin.isInside(tileX, tileY)) {
        return ruin;
      }
    }
    return null;
  }

  generateRuins(world) {
    const maxDepth = WORLD_HEIGHT - SURFACE_Y;

    for (let y = SURFACE_Y + RUINS_SPAWN_CONFIG.minDepth; y < WORLD_HEIGHT - 20; y += 30) {
      const depthRatio = (y - SURFACE_Y) / maxDepth;
      const chance = RUINS_SPAWN_CONFIG.baseChance +
        (RUINS_SPAWN_CONFIG.maxChance - RUINS_SPAWN_CONFIG.baseChance) * depthRatio;

      for (let x = 10; x < WORLD_WIDTH - 30; x += 40) {
        if (Math.random() < chance) {
          const depthLevel = y - SURFACE_Y;
          const ruin = this.generator.generateRuin(x, y, depthLevel);

          if (this.isValidRuinPosition(ruin)) {
            this.ruins.push(ruin);
            this.placeRuinInWorld(ruin, world);
          }

          x += 30;
        }
      }
    }
  }

  isValidRuinPosition(ruin) {
    if (ruin.x < 5 || ruin.x + ruin.width >= WORLD_WIDTH - 5) return false;
    if (ruin.y < SURFACE_Y + RUINS_SPAWN_CONFIG.minDepth) return false;
    if (ruin.y + ruin.height >= WORLD_HEIGHT - 5) return false;

    for (const existing of this.ruins) {
      const padding = 10;
      if (!(ruin.x + ruin.width + padding < existing.x ||
            existing.x + existing.width + padding < ruin.x ||
            ruin.y + ruin.height + padding < existing.y ||
            existing.y + existing.height + padding < ruin.y)) {
        return false;
      }
    }

    return true;
  }

  placeRuinInWorld(ruin, world) {
    for (let y = 0; y < ruin.height; y++) {
      for (let x = 0; x < ruin.width; x++) {
        const worldX = ruin.x + x;
        const worldY = ruin.y + y;

        if (!world.inBounds(worldX, worldY)) continue;

        world.setTile(worldX, worldY, TILE_TYPES.RUINS_WALL);
      }
    }

    for (const room of ruin.rooms) {
      for (let y = room.y; y < room.y + room.height; y++) {
        for (let x = room.x; x < room.x + room.width; x++) {
          const worldX = ruin.x + x;
          const worldY = ruin.y + y;
          if (world.inBounds(worldX, worldY)) {
            world.setTile(worldX, worldY, TILE_TYPES.RUINS_FLOOR);
          }
        }
      }
    }

    this.placeCorridorsInWorld(ruin, world);

    for (const chest of ruin.chests) {
      const worldX = ruin.x + chest.x;
      const worldY = ruin.y + chest.y;
      if (world.inBounds(worldX, worldY)) {
        world.setTile(worldX, worldY, TILE_TYPES.RUINS_CHEST);
      }
    }

    for (const trap of ruin.traps) {
      const worldX = ruin.x + trap.x;
      const worldY = ruin.y + trap.y;
      if (world.inBounds(worldX, worldY)) {
        world.setTile(worldX, worldY, TILE_TYPES.RUINS_TRAP);
      }
    }

    for (const plate of ruin.pressurePlates) {
      const worldX = ruin.x + plate.x;
      const worldY = ruin.y + plate.y;
      if (world.inBounds(worldX, worldY)) {
        world.setTile(worldX, worldY, TILE_TYPES.RUINS_PRESSURE_PLATE);
      }
    }

    for (const door of ruin.doors) {
      const worldX = ruin.x + door.x;
      const worldY = ruin.y + door.y;
      if (world.inBounds(worldX, worldY)) {
        world.setTile(worldX, worldY, TILE_TYPES.RUINS_DOOR);
      }
    }

    for (const torch of ruin.torchPositions) {
      const worldX = ruin.x + torch.x;
      const worldY = ruin.y + torch.y;
      if (world.inBounds(worldX, worldY)) {
        const currentTile = world.getTile(worldX, worldY);
        if (currentTile === TILE_TYPES.RUINS_WALL || currentTile === TILE_TYPES.RUINS_FLOOR) {
          world.setTile(worldX, worldY, TILE_TYPES.RUINS_TORCH);
        }
      }
    }

    if (ruin.altarPosition) {
      const worldX = ruin.x + ruin.altarPosition.x;
      const worldY = ruin.y + ruin.altarPosition.y;
      if (world.inBounds(worldX, worldY)) {
        world.setTile(worldX, worldY, TILE_TYPES.RUINS_ALTAR);
      }
    }
  }

  placeCorridorsInWorld(ruin, world) {
    const rooms = ruin.rooms;
    for (let i = 1; i < rooms.length; i++) {
      const roomA = rooms[i - 1];
      const roomB = rooms[i];

      const ax = Math.floor(roomA.x + roomA.width / 2);
      const ay = Math.floor(roomA.y + roomA.height / 2);
      const bx = Math.floor(roomB.x + roomB.width / 2);
      const by = Math.floor(roomB.y + roomB.height / 2);

      if (Math.random() < 0.5) {
        this.placeHCorridor(ruin, world, ax, bx, ay);
        this.placeVCorridor(ruin, world, ay, by, bx);
      } else {
        this.placeVCorridor(ruin, world, ay, by, ax);
        this.placeHCorridor(ruin, world, ax, bx, by);
      }
    }
  }

  placeHCorridor(ruin, world, x1, x2, y) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
      const worldX = ruin.x + x;
      const worldY = ruin.y + y;
      if (world.inBounds(worldX, worldY)) {
        world.setTile(worldX, worldY, TILE_TYPES.RUINS_FLOOR);
      }
      const worldY2 = ruin.y + y - 1;
      if (world.inBounds(worldX, worldY2)) {
        world.setTile(worldX, worldY2, TILE_TYPES.RUINS_FLOOR);
      }
    }
  }

  placeVCorridor(ruin, world, y1, y2, x) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
      const worldX = ruin.x + x;
      const worldY = ruin.y + y;
      if (world.inBounds(worldX, worldY)) {
        world.setTile(worldX, worldY, TILE_TYPES.RUINS_FLOOR);
      }
      const worldX2 = ruin.x + x - 1;
      if (world.inBounds(worldX2, worldY)) {
        world.setTile(worldX2, worldY, TILE_TYPES.RUINS_FLOOR);
      }
    }
  }

  checkTrapCollision(player, world) {
    const tileX = Math.floor(player.x / TILE_SIZE);
    const tileY = Math.floor(player.y / TILE_SIZE);
    const ruin = this.getRuinAt(tileX, tileY);

    if (!ruin) return null;

    const localX = tileX - ruin.x;
    const localY = tileY - ruin.y;

    for (const trap of ruin.traps) {
      if (trap.x === localX && trap.y === localY && !trap.triggered) {
        trap.triggered = true;
        return trap;
      }
    }

    return null;
  }

  checkChestInteraction(player, world) {
    const tileX = Math.floor(player.x / TILE_SIZE);
    const tileY = Math.floor(player.y / TILE_SIZE);
    const ruin = this.getRuinAt(tileX, tileY);

    if (!ruin) return null;

    const localX = tileX - ruin.x;
    const localY = tileY - ruin.y;

    for (const chest of ruin.chests) {
      if (Math.abs(chest.x - localX) <= 1 && Math.abs(chest.y - localY) <= 1 && !chest.opened) {
        return { ruin, chest };
      }
    }

    return null;
  }

  openChest(ruin, chest) {
    chest.opened = true;
    return chest.loot;
  }

  checkPressurePlate(player, world) {
    const tileX = Math.floor(player.x / TILE_SIZE);
    const tileY = Math.floor(player.y / TILE_SIZE);
    const ruin = this.getRuinAt(tileX, tileY);

    if (!ruin) return null;

    const localX = tileX - ruin.x;
    const localY = tileY - ruin.y;

    for (const plate of ruin.pressurePlates) {
      if (plate.x === localX && plate.y === localY && !plate.activated) {
        plate.activated = true;
        return { ruin, plate };
      }
    }

    return null;
  }

  activatePressurePlate(ruin, plate) {
    if (plate.linkedDoorIndex !== undefined && ruin.doors[plate.linkedDoorIndex]) {
      const door = ruin.doors[plate.linkedDoorIndex];
      door.open = !door.open;
      door.locked = false;

      const worldX = ruin.x + door.x;
      const worldY = ruin.y + door.y;
      return { worldX, worldY, open: door.open };
    }
    return null;
  }

  updateExploration(playerTileX, playerTileY) {
    const ruin = this.getRuinAt(playerTileX, playerTileY);
    if (ruin) {
      if (!ruin.discovered) {
        ruin.discovered = true;
        return { type: 'discovered', ruin };
      }

      const justCompleted = ruin.addExploredTile(playerTileX, playerTileY);
      if (justCompleted) {
        return { type: 'completed', ruin };
      }
    }
    return null;
  }

  getCurrentRuin(playerTileX, playerTileY) {
    return this.getRuinAt(playerTileX, playerTileY);
  }
}
