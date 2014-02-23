$(function() {
  var importJson;
  var importPng;

  var maxZoom = 3;
  var zoom = maxZoom;
  var tileSize = 40;
  
  function positionCss(x, y) {
    return -x*tileSize + 'px ' + -y*tileSize + 'px';
  }
  function TileType(name, sheetX, sheetY, r,g,b, toolTipText, extra) {
    this.name = name;
    this.sheetX = sheetX;
    this.sheetY = sheetY;
    this.color = String.fromCharCode(r)+String.fromCharCode(g)+String.fromCharCode(b)+String.fromCharCode(255);
    this.postPlaceFn = extra&&extra.postPlaceFn;
    this.logicFn = extra&&extra.logicFn;
    this.image = extra&&extra.image;
    this.rgb = r | (g<<8) | (b<<16);
    this.opposite = this; // What it switches to when mirrored
    this.toolTipText = toolTipText;
  }
  TileType.prototype.positionCss = function() {
    return positionCss(this.sheetX, this.sheetY)
  }
  TileType.prototype.drawOn = function($elem, tile) {
    var styleBgColor = '';
    var styleUrl = 'url("' + (this.image || 'default-skin') + '.png")';
    var styleBackgroundSize = this.image ? (5*tileSize+'px ' + tileSize + 'px') : (13*tileSize + 'px ' + 9*tileSize + 'px');
    if (this.name == 'empty') {
      styleBgColor = 'black';
      styleUrl = '';
    }
    if (styleBgColor != $elem.styleBgColor) {
      $elem.css('background-color', styleBgColor);
      $elem.styleBgColor = styleBgColor;
    }
    if (styleBackgroundSize != $elem.styleBackgroundSize) {
      $elem.css('background-size', styleBackgroundSize);
      $elem.styleBackgroundSize = styleBackgroundSize;
    }
    if (styleUrl != $elem.styleUrl) {
      $elem.css('background-image', styleUrl)
      $elem.styleUrl = styleUrl;
    }
    if (this == wallType && tile) {
      var x = tile.x, y = tile.y;
      var idx = (isWall(x-1,y)?1:0) | (isWall(x+1,y)?2:0) | (isWall(x,y-1)?4:0) | (isWall(x,y+1)?8:0);
      var coords = [
        [0,0], //
        [9,6], // L
        [8,6], // R
        [2,4], // LR
        [0,6], // U
        [6,8], // LU
        [2,8], // RU
        [4,8], // LRU
        [0,2],  // D
        [6,0], // LD
        [2,0], // RD
        [4,0], // LRD
        [4,1], // UD
        [7,4], // LUD
        [0,4], // RUD
        [4,4]  // LRUD
      ][idx];
      $elem.css('background-position', positionCss(coords[0], coords[1]))
    } else {
      $elem.css('background-position', this.positionCss())
    }
  }


  function Tool(fns) {
    this.type = fns.type || '';
    this.down = fns.down || function() {};
    this.speculateDrag = fns.speculateDrag || function() {};
    this.speculateUp = fns.speculateUp || function() {};
    this.drag = fns.drag || function() {};
    this.up = fns.up || function() {};
    this.select = fns.select || function() {};
    this.unselect = fns.unselect || function() {};
    this.stateChange = fns.stateChange || function() {}; // arbitrary state change happened -- redraw tool state if necessary
    this.getState = fns.getState || function() {};
    this.setState = fns.setState || function() {};
  }
  var pencil = new Tool({
    speculateDrag: function(x,y) {
      return new UndoStep([
        new TileState(tiles[x][y], {type:brushTileType})
      ]);
    },
  });
  var brush = new Tool({
    speculateDrag: function(x,y) {
      var changes = [];
      for (var ix=x-1; ix<=x+1; ix++) {
        for (var iy=y-1; iy<=y+1; iy++) {
          if (ix>=0 && iy>=0 && ix<width && iy<height) {
            changes.push(new TileState(tiles[ix][iy], {type:brushTileType}));
          }
        }
      }
      return new UndoStep(changes);
    }
  });

  function lineFn (x0, y0, x1, y1) {
    var deltaX = x1 - x0;
    var deltaY = y1 - y0;
    var y = 0;

    var lineTiles = [];

    if (deltaX == 0) {
      var low = Math.min(y0, y1);
      var high = Math.max(y0, y1);
      for (var yi = low; yi <= high; yi++) {
        lineTiles.push({x: x0, y: yi});
      }

    } else if (deltaY == 0) {
      var left = Math.min(x0, x1);
      var right = Math.max(x0, x1);
      for (var xi = left; xi <= right; xi++) {
        lineTiles.push({x: xi, y: y0});
      }

    } else {
      var slope = deltaY / deltaX;
      var intercept;
      var intercept = y0 - slope * x0;

      if (Math.abs(slope) <= 1) {
        var left = Math.min(x0, x1);
        var right = Math.max(x0, x1);
        for (var xi = left; xi <= right; xi++) {
          var y = slope * xi + intercept;
          lineTiles.push({x: xi, y: Math.round(y)});
        }
      } else {
        var low = Math.min(y0, y1);
        var high = Math.max(y0, y1);
        for (var yi = low; yi <= high; yi++) {
          var x = (yi-intercept) / slope;
          lineTiles.push({x: Math.round(x), y: yi});
        }
      }
    }

    return lineTiles;
  }

  var line = new Tool({
    down: function(x,y) {
      this.downX = x;
      this.downY = y;
      console.log('down at ', x,y);
    },
    speculateUp: function(x,y) {
      var coordinates = lineFn(this.downX===undefined?x:this.downX, this.downY===undefined?y:this.downY, x, y);
      var calculatedTiles = [];
      for (var i = 0; i < coordinates.length; i++) {
        calculatedTiles.push(new TileState(tiles[coordinates[i].x][coordinates[i].y], {type: brushTileType}));
      }
      return new UndoStep(calculatedTiles);
    },
    up: function(x,y) {
      this.downX = undefined;
      this.downY = undefined;
    }
  })


  function rectFn (x0, y0, x1, y1, fill) {
    var rectTiles = [];
    var left = Math.min(x0, x1);
    var right = Math.max(x0, x1);
    var low = Math.min(y0, y1);
    var high = Math.max(y0, y1);
    for (var xi = left; xi <= right; xi++) {
      for (var yi = low; yi <= high; yi++) {
        var addTile = fill || xi == left || xi == right || yi == low || yi == high;
        if (addTile) {
          rectTiles.push({x: xi, y: yi});
        }
      }
    }
    return rectTiles;
  }

  var rectFill = new Tool({
    down: function(x,y) {
      this.downX = x;
      this.downY = y;
      console.log('down at ', x,y);
    },
    speculateUp: function(x,y) {
      var coordinates = rectFn(this.downX===undefined?x:this.downX, this.downY===undefined?y:this.downY, x, y, true);
      var calculatedTiles = [];
      for (var i = 0; i < coordinates.length; i++) {
        calculatedTiles.push(new TileState(tiles[coordinates[i].x][coordinates[i].y], {type: brushTileType}));
      }
      return new UndoStep(calculatedTiles);
    },
    up: function(x,y) {
      this.downX = undefined;
      this.downY = undefined;
    }
  })

  var rectOutline = new Tool({
    down: function(x,y) {
      this.downX = x;
      this.downY = y;
      console.log('down at ', x,y);
    },
    speculateUp: function(x,y) {
      var coordinates = rectFn(this.downX===undefined?x:this.downX, this.downY===undefined?y:this.downY, x, y, false);
      var calculatedTiles = [];
      for (var i = 0; i < coordinates.length; i++) {
        calculatedTiles.push(new TileState(tiles[coordinates[i].x][coordinates[i].y], {type: brushTileType}));
      }
      return new UndoStep(calculatedTiles);
    },
    up: function(x,y) {
      this.downX = undefined;
      this.downY = undefined;
    }
  })

  // taken from http://members.chello.at/~easyfilter/bresenham.html
  function circleFn (x0, y0, x1, y1, fill) {
    var circleTiles = [];
    var a = Math.abs(x1-x0), b = Math.abs(y1-y0), b1 = b&1; /* values of diameter */
    var dx = 4*(1-a)*b*b, dy = 4*(b1+1)*a*a; /* error increment */
    var err = dx+dy+b1*a*a, e2; /* error of 1.step */

    if (x0 > x1) { x0 = x1; x1 += a; } /* if called with swapped points */
    if (y0 > y1) y0 = y1; /* .. exchange them */
    y0 += (b+1)/2; y1 = y0-b1;   /* starting pixel */
    a *= 8*a; b1 = 8*b*b;

    function addToCircleTiles(x, y) {
      var flooredY = Math.floor(y);
      circleTiles.push({x: x, y: flooredY});
      if (fill) {
        for (var yi = Math.floor(y1); yi < flooredY; yi++) {
          circleTiles.push({x: x, y: yi});
        }
      }
    }
    do {
      addToCircleTiles(x1, y0); /*   I. Quadrant */
      addToCircleTiles(x0, y0); /*  II. Quadrant */
      addToCircleTiles(x0, y1); /* III. Quadrant */
      addToCircleTiles(x1, y1); /*  IV. Quadrant */
      e2 = 2*err;
      if (e2 <= dy) { y0++; y1--; err += dy += a; }  /* y step */
      if (e2 >= dx || 2*err > dy) { x0++; x1--; err += dx += b1; } /* x step */
    } while (x0 <= x1);

    while (y0-y1 < b) {  /* too early stop of flat ellipses a=1 */
      addToCircleTiles(x0-1, y0); /* -> finish tip of ellipse */
      addToCircleTiles(x1+1, y0++);
      addToCircleTiles(x0-1, y1);
      addToCircleTiles(x1+1, y1--);
    }
    return circleTiles;
  }

  var circleFill = new Tool({
    down: function(x,y) {
      this.downX = x;
      this.downY = y;
      console.log('down at ', x,y);
    },
    speculateUp: function(x,y) {
      var coordinates = circleFn(this.downX===undefined?x:this.downX, this.downY===undefined?y:this.downY, x, y, true);
      var calculatedTiles = [];
      for (var i = 0; i < coordinates.length; i++) {
        calculatedTiles.push(new TileState(tiles[coordinates[i].x][coordinates[i].y], {type: brushTileType}));
      }
      return new UndoStep(calculatedTiles);
    },
    up: function(x,y) {
      this.downX = undefined;
      this.downY = undefined;
    }
  })

  var circleOutline = new Tool({
    down: function(x,y) {
      this.downX = x;
      this.downY = y;
      console.log('down at ', x,y);
    },
    speculateUp: function(x,y) {
      var coordinates = circleFn(this.downX===undefined?x:this.downX, this.downY===undefined?y:this.downY, x, y, false);
      var calculatedTiles = [];
      for (var i = 0; i < coordinates.length; i++) {
        calculatedTiles.push(new TileState(tiles[coordinates[i].x][coordinates[i].y], {type: brushTileType}));
      }
      return new UndoStep(calculatedTiles);
    },
    up: function(x,y) {
      this.downX = undefined;
      this.downY = undefined;
    }
  })

  var fill = new Tool({
    speculateUp: function(x,y) {
      var targetType = tiles[x][y].type;

      var toChange = [ tiles[x][y] ];

      var changed = [ new TileState(tiles[x][y], {type:brushTileType}) ];
      var inChanged = {};
      while (toChange.length > 0) {

        var tempToChange = [];

        toChange.forEach(function(tile) {
          for (var ix=tile.x-1; ix<=tile.x+1; ix++) {
            for (var iy=tile.y-1; iy<=tile.y+1; iy++) {
              if (Math.abs(tile.x-ix) + Math.abs(tile.y-iy) == 1&& ix>=0 && iy>=0 && ix<width && iy<height) {
                var test = tiles[ix][iy];
                if (test.type == targetType && !inChanged[xy(test)]) {
                  tempToChange.push(test);
                  changed.push(new TileState(test, {type: brushTileType}));
                  inChanged[xy(test)] = true;
                }
              }
            }
          }
        });
        toChange = tempToChange;
      }
      return new UndoStep(changed);
    }
  })

  var wire = new Tool({
    type: 'special',
    unselect: function() {
      clearHighlights();
      this.selectedSwitch = null;
    },
    stateChange: function() {
      this.refreshHighlights();
    },
    getState: function() {
      console.log('storing state', this.selectedSwitch && xy(this.selectedSwitch))
      return {selectedSwitch: this.selectedSwitch}
    },
    setState: function(state) {
      this.selectedSwitch = state.selectedSwitch;
      console.log('restored state', this.selectedSwitch && xy(this.selectedSwitch))
    },
    speculateUp: function(x,y) {
      var tile = tiles[x][y];
      var change = null;
      if (tile.type == portalType) {
        if (this.selectedSwitch && this.selectedSwitch.type == portalType) {
          change = new TileState(this.selectedSwitch, {destination: tile})
          console.log('making destination action to', xy(tile));
          this.selectedSwitch = null;
        } else {
          this.selectedSwitch = tile;
          console.log('selected ', xy(this.selectedSwitch));
        }
      } else if (tile.type == switchType) {
        this.selectedSwitch = tile;
      } else if (this.selectedSwitch && this.selectedSwitch.type == switchType) {
        var affected = this.selectedSwitch.affected || ( this.selectedSwitch.affected={});
        var affected = {};
        for (var key in (this.selectedSwitch.affected||{})) {
          affected[key] = this.selectedSwitch.affected[key];;
        }
        var hitKey = xy(tile);
        if (affected[hitKey]) delete affected[hitKey];
        else affected[hitKey] = tile;
        
        change = new TileState(this.selectedSwitch, {affected: affected});
      }
      return new UndoStep(change ? [change] : []);
    }
  });
  wire.refreshHighlights = function() {
    clearHighlights();
    if (this.selectedSwitch) {
      this.selectedSwitch.highlight(true);
      if (this.selectedSwitch.type == portalType) {
        if (this.selectedSwitch.destination) {
          this.selectedSwitch.destination.highlight(true);
        }
      } else if (this.selectedSwitch.type == switchType) {
        var sel = this.selectedSwitch.affected || ( this.selectedSwitch.affected={});
        for (var key in sel) {
          sel[key].highlight(true);
        }
      }
    }
  }

  function clearHighlights() {
    $map.find('.selectionIndicator').css('display', 'none');
  }

  function ensureUnique(placedX, placedY) {
    for (var x=0; x<width; x++) {
      for (var y=0; y<height; y++) {
        if (x==placedX && y==placedY) continue;
        if (tiles[x][y].type == this) {
          tiles[x][y].setType(floorType);
        }
      }
    }
  }

  function Point(sourceOrX, maybeY) {
    if (maybeY) {
      this.x = sourceOrX;
      this.y = maybeY;
    } else {
      this.x = sourceOrX.x;
      this.y = sourceOrX.y;
    }
  }
  Point.cmp = function(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    if (a.x != b.x) return a.x - b.x;
    return a.y - b.y;
  }
  function TileState(source, changes) {
    changes = changes || {};
    this.x = changes.x || source.x 
    this.y = changes.y || source.y;
    this.type = changes.type || source.type;
    this.affected = [];
    var affectedMap = changes.affected || source.affected || {};
    for (var key in affectedMap) {
      this.affected.push(new Point(affectedMap[key]));
    }
    this.affected.sort(Point.cmp);
    var destTile = changes.destination || source.destination;
    this.destination = destTile && new Point(destTile);
  }
  TileState.prototype.equals = function(other) {
    if (this.x!=other.x
      || this.y!=other.y
      || this.type!=other.type
      || Point.cmp(this.destination, other.destination)
      || this.affected.length != other.affected.length) return false;
    for (var i=0; i<this.affected.length; i++) {
      if (Point.cmp(this.affected[i], other.affected[i])) return false;
    }
    return true;
  }
  TileState.prototype.restoreInto = function(tile) {
    tile.setType(this.type);
    tile.affected = {};
    for (var i=0; i<this.affected.length; i++) {
      var a = this.affected[i];
      tile.affected[xy(a)] = tiles[a.x][a.y];
    }
    tile.destination = this.destination && tiles[this.destination.x][this.destination.y];
    mayHaveChanged(tile);
  }

  function recordStep() {
    var changes = [];

    if (!backingStates || backingStates.length != tiles.length || backingStates[0].length != tiles[0].length) {
      var size;
      if (backingStates) {
        for (var x=0; x<backingStates.length; x++) {
          for (var y=0; y<backingStates[0].length; y++) {
            if (x>= tiles.length || y>=tiles[0].length) {
              changes.push(backingStates[x][y]);
            }
          }
        }
        size = new Point({x:backingStates.length, y:backingStates[0].length});
      }
      backingStates = [];
      for (var x=0; x<tiles.length; x++) {
        backingStates[x] = [];
        for (var y=0; y<tiles[x].length; y++) {
          backingStates[x][y] = new TileState(tiles[x][y]);
        }
      }

      dirtyStates = {}
      return new UndoStep(changes, size);
    }

    for (var key in dirtyStates) {
      var newState = new TileState(dirtyStates[key]);
      if (!newState.equals(backingStates[newState.x][newState.y])) {
        changes.push(backingStates[newState.x][newState.y]);
        backingStates[newState.x][newState.y] = newState;
      }
    }
    dirtyStates = {}
    if (!changes.length) return null;
    return new UndoStep(changes, null);
  }

  function savePoint() {
    var step = recordStep();
    if (step) {
      undoSteps.push(step);
      redoSteps = [];
      enableUndoRedoButtons();
    }
  }
  
  function applyStep(step) {
    var tileChanges = step.states;
    if (step.size) {
      var types = [];
      for (var x=0; x<step.size.x; x++) {
        types[x] = [];
        for (var y=0; y<step.size.y; y++) {
          types[x][y] = x<tiles.length && y<tiles[0].length ? tiles[x][y].type : emptyType;
        }
      }
      buildTilesWith(types);
      for (var x=0; x<backingStates.length && x<tiles.length; x++) {
        for (var y=0; y<backingStates[x].length && y<tiles[0].length; y++) {
          backingStates[x][y].restoreInto(tiles[x][y]);
        }
      }
    }

    for (var i=0; i<tileChanges.length; i++) {
      var change = tileChanges[i];
      change.restoreInto(tiles[change.x][change.y]);
    }
    cleanDirtyWalls();
    if (selectedTool) selectedTool.stateChange();
  }

  function moveChange(fromSteps, toSteps) {
    if (!fromSteps.length) return;

    var step = fromSteps.splice(fromSteps.length-1, 1)[0];
    applyStep(step);
    
    var step = recordStep();
    if (step) {
      toSteps.push(step);
    }
  }

  function enable($elem, enabled) {
    if (enabled) $elem.removeAttr('disabled');
    else $elem.attr('disabled', 'disabled')
  }
  function enableUndoRedoButtons() {
    enable($('#undo'), undoSteps.length);
    enable($('#redo'), redoSteps.length);
  }
  function undo() {
    moveChange(undoSteps, redoSteps);
    enableUndoRedoButtons();
  }
  function redo() {
    moveChange(redoSteps, undoSteps);
    enableUndoRedoButtons();
  }

  function xy(pt) {
    return pt.x + ',' + pt.y;
  }

  var backingStates = null;
  var dirtyStates = {};
  function mayHaveChanged(tile) {
    dirtyStates[xy(tile)] = tile;
  }

  function UndoStep(states, size) {
    this.states = states;
    this.size = size;
  }
  var undoSteps = [];
  var redoSteps = [];

  function setFieldFn(defaultState) {
    return function(logic, tile) {
      logic.fields[tile.x + ',' + tile.y] = {defaultState: defaultState};
    }
  }

  function exportSwitch(logic, tile) {
    var toggles = [];
    for (var key in tile.affected) {
      var affectedTile = tile.affected[key];
      var t = affectedTile.type;
      if (t==bombType || t==onFieldType || t==offFieldType || t==redFieldType || t==blueFieldType) {
        toggles.push({pos: {x: affectedTile.x, y: affectedTile.y}});
      }
    }
    logic.switches[tile.x + ',' + tile.y] = {toggle: toggles};
  }
  function exportPortal(logic, tile) {
    var dest = tile.destination || tile;
    logic.portals[tile.x + ',' + tile.y] = {destination: {x: dest.x, y: dest.y}};
  }

  var floorType, emptyType, wallType, blueFlagType, redFlagType, switchType, bombType, onFieldType, offFieldType,
    redFieldType, blueFieldType, portalType, redSpawnType, blueSpawnType, redSpeedPadType, blueSpeedpadType, redFloorType, blueFloorType,
    spikeType, powerupType, speedpadType;
  var tileTypes = [
    emptyType = new TileType('empty', 0,1, 0,0,0, "Background"),
    floorType = new TileType('floor', 2,2, 212,212,212, "Tile"),
    wallType = new TileType('wall', 0,0, 120,120,120, "Wall"),
    switchType = new TileType('switch', 2,5, 185,122,87, "Button - Emits signals to gates and bombs.", {logicFn: exportSwitch}),
    spikeType = new TileType('spike', 2,3, 55,55,55, "Spike"),
    bombType = new TileType('bomb', 6,5, 255,128,0, "Bomb - Receives signals from switches."),
    powerupType = new TileType('powerup', 7,8, 0,255,0, "Powerup"),
    speedpadType = new TileType('speedpad', 0,0, 255,255,0, "Boost", {image: 'speedpad'}),
    blueSpeedpadType = new TileType('blueSpeedpad', 0,0, 115,115,255, "Blue Team Boost", {image: 'speedpadblue'}),
    redSpeedPadType = new TileType('redSpeedpad', 0,0, 255,115,115, "Red Team Boost", {image: 'speedpadred'}),
    redFloorType = new TileType('redFloor', 3,1, 220,186,186, "Red Speed Tile - Increases speed for non-flag-carriers."),
    blueFloorType = new TileType('blueFloor', 3,2, 187,184,221, "Blue Speed Tile - Increases speed for non-flag-carriers."),
    offFieldType = new TileType('offField', 10,1, 0,117,0, "Gate - Default Off", {logicFn: setFieldFn('off')}),
    onFieldType = new TileType('onField', 10,2, 0,117,0, "Gate - Default On", {logicFn: setFieldFn('on')}),
    redFieldType = new TileType('redField', 10,3, 0,117,0, "Gate - Default Red", {logicFn: setFieldFn('red')}),
    blueFieldType = new TileType('blueField', 10,4, 0,117,0, "Gate - Default Blue", {logicFn: setFieldFn('blue')}),
    portalType = new TileType('portal', 0,0, 202, 192,0, "Portal - Link two portals using the wire tool.", {image: 'portal', logicFn: exportPortal}),
    redFlagType = new TileType('redFlag', 8,0, 255,0,0, "Red Flag"),
    blueFlagType = new TileType('blueFlag', 9,0, 0,0,255, "Blue Flag"),
    redSpawnType = new TileType('redSpawn', 6,2, 155,0,0, "Red Spawn Tile - Red balls will spawn within a certain radius of this tile."),
    blueSpawnType = new TileType('blueSpawn', 6,3, 0,0,155, "Blue Spawn Tile - Blue balls will spawn within a certain radius of this tile.")
  ]
  function areOpposites(t1, t2) {
    t1.opposite = t2;
    t2.opposite = t1; 
  }
  areOpposites(redSpeedPadType, blueSpeedpadType);
  areOpposites(redFloorType, blueFloorType);
  areOpposites(redFieldType, blueFieldType);
  areOpposites(redFlagType, blueFlagType);
  areOpposites(redSpawnType, blueSpawnType);
  

  function Tile(options, elem) {
    this.set(options);
    if (elem) {
      this.elem = elem;
      this.setType(options.type, true);
      this.background = elem.parent();
      this.selectionIndicator = elem[0].children[0];
      this.affectedIndicator = elem[0].children[1];
    }
  }
  Tile.prototype.set = function(options) {
    this.x = options.x;
    this.y = options.y;
    this.type = options.type;
    this.affected = {};
    for (var key in options.affected || {}) {
      this.affected[key] = options.affected[key]
    }
    this.destination = options.destination;
  }
  Tile.prototype.setType = function(type, force) {
    if  (this.type==type && !force) return;
    this.type = type;
    type.drawOn(this.elem, this);
    if (type.postPlaceFn) {
      type.postPlaceFn.call(type, this.x, this.y);
    }

    maybeIsDirtyWall(this.x-1, this.y);
    maybeIsDirtyWall(this.x+1, this.y);
    maybeIsDirtyWall(this.x, this.y-1);
    maybeIsDirtyWall(this.x, this.y+1);
    mayHaveChanged(this);
  }
  Tile.prototype.highlight = function(highlighted) {
    this.elem.find('.selectionIndicator').css('display', highlighted ? 'inline-block' : 'none');
  }
  Tile.prototype.highlightWithPotential = function(highlighted) {
    this.elem.find('.potentialHighlight').css('display', highlighted ? 'inline-block' : 'none');
  }
  function clearPotentialHighlights() {
    $map.find('.potentialHighlight').css('display', 'none');
  }


  var dirtyWalls = {};
  function isWall(x, y) {
    return tiles[x] && tiles[x][y] && tiles[x][y].type == wallType;
  }
  function maybeIsDirtyWall(x, y) {
    if (isWall(x,y)) dirtyWalls[x + ',' + y] = tiles[x][y];
  }
  function cleanDirtyWalls() {
    for (var key in dirtyWalls) {
      var wall = dirtyWalls[key];
      if (wall.type != wallType) continue;

      wall.type.drawOn(wall.elem, wall);
    }
    dirtyWalls = {};
  }

  var $map = $('#map');
  var $palette = $('#palette');

  var height;
  var width;
  var $tiles;
  var tiles;

  function buildTilesWith(types) {
    width = types.length;
    height = types[0].length;

    var html = '';
    var row = "<div class='tileRow'>";


    for (var x=0; x<width; x++) {
      row += "<div class='tileBackground'><div class='tile nestedSquare'><div class='selectionIndicator nestedSquare'></div><div class='potentialHighlight nestedSquare'></div></div></div>";
    }
    row += "</div>"
    for (var y=0; y<height; y++) {
      html += row;
    }
    $map.html( html );

    $tiles = $map.find('.tile');
    tiles = [];

    for (var x=0; x<width; x++) {
      tiles[x] = [];
      for (var y=0; y<height; y++) {
        var $tile = $($tiles[y*width + x]).data('x', x).data('y', y);
        var tile = tiles[x][y] = new Tile({x: x, y: y, type: types[x][y]}, $tile);
      }
    }

    cleanDirtyWalls();

    $('#resizeWidth').val(width);
    $('#resizeHeight').val(height);
    showZoom();
  }

  function clearMap() {
    var emptyTypes = [];
    for (var x=0;x<20;x++) {
      var col = emptyTypes[x] = [];
      for (var y=0; y<20; y++) {
        col.push(floorType)
      }
    }
    buildTilesWith(emptyTypes);
    savePoint();
    clearHistory();
    $('#mapName').val('Untitled');
    $('#author').val('Anonymous');
  };
  clearMap();

  var symmetry = 'None';

  $('#symmetry').change(function() {
    console.log('Symmetry was ', symmetry);
    symmetry = $(this).val();
    console.log('Symmetry is ', symmetry);
  });

  var potentialTiles = [];
  var potentialSymmetryTiles = []; // these are tiles that will oppositely colored


  function applyPotentials() {
    $.each(potentialSymmetryTiles, function(key, tile) {
      tile.setType(brushTileType.opposite);
    });
    $.each(potentialTiles, function(key, tile) {
      tile.setType(brushTileType);
    });
    cleanDirtyWalls();
  }

  function setPotentials(tiles, symmetryTiles) {
    //console.log('Setting potentials', tiles);
    potentialTiles = tiles;
    potentialSymmetryTiles = symmetryTiles;
    $.each(potentialTiles, function(key, tile) {
      tile.highlightWithPotential(true);
    });
    $.each(potentialSymmetryTiles, function(key, tile) {
      tile.highlightWithPotential(true);
    } )
  }
  
  function transformPoint(pt, how) {
    pt.x = pt.x*how[0] + (tiles.length-1)*how[1];
    pt.y = pt.y*how[2] + (tiles[0].length-1)*how[3];
    if (pt.type && how[4]) pt.type = pt.type.opposite;
  }
  
  var symmetryFns = {
    'Horizontal': [
      [1,0,  1,0],
      [-1,1, 1,0, true]
    ],
    'Vertical': [
      [1,0, 1,0],
      [1,0, -1,1, true]
    ],
    '4-Way': [
      [1,0, 1,0],
      [-1,1, 1,0, true],
      [1,0, -1,1, true],
      [-1,1, -1,1]
    ],
    'Rotational': [
      [1,0, 1,0],
      [-1,1, -1,1, true]
    ]
  }
  
  function applySymmetry(step) {
    var transforms = symmetryFns[symmetry];
    var tileChangeMap = {};
    if (transforms) {
      step.states.forEach(function(state) {
        transforms.forEach(function(transform) {
          var transformedState = new TileState(state);
          transformPoint(transformedState, transform);
          if (transformedState.affected) {
            transformedState.affected.forEach(function(pt) {
              transformPoint(pt, transform);
            });
          }
          if (transformedState.destination) {
            transformPoint(transformedState.destination, transform);
          }
          tileChangeMap[xy(transformedState)] = transformedState;
        });
        
      });
    }
    
    
    step.states.forEach(function(state) {
      tileChangeMap[xy(state)] = state;
    });
    
    step.states = [];
    for (var key in tileChangeMap) {
      step.states.push(tileChangeMap[key]);
    }
  }
  
  function setSpeculativeStep(step) {
    applySymmetry(step);
    $.each(step.states, function(idx, state) {
      tiles[state.x][state.y].highlightWithPotential(true);
    });
  }
  
  $map.mouseleave(function(e) {
    console.log('map left');
  });

  var controlDown = false;

  $(document).keydown(function(e) {
    if(e.which==17) { // control
      controlDown = true;
    } else if (e.which==90) { //z
      undo();
    } else if (e.which==89) { //y
      redo();
    }
  }).keyup(function(e) {
    if (e.which==17) { // control
      controlDown = false;
    }
    if (e.which==16) {
      selectedTool

    }
  });
  
  $(window).blur (function() { // If the user ctrl-tabs away, it won't the keyup won't register
    controlDown = false;
  })

  var lineAnchor = null;

  var mouseDown = false;
  $map.on('mouseenter', '.tile', function(e) {

    var x = $(this).data('x');
    var y = $(this).data('y');

    if (!selectedTool) return;

    if (selectedTool.speculateDrag || selectedTool.speculateUp) { // should really test for speculatedDown || speculateDrag, maybe
      var st = selectedTool.getState();
      var change = selectedTool.speculateDrag && selectedTool.speculateDrag(x,y);
      if (!change) {
        change = selectedTool.speculateUp && selectedTool.speculateUp(x,y)
      }
      selectedTool.setState(st);
      setSpeculativeStep(change);
      return;
    }
    })
    .on('mouseleave', '.tile', function(e) {
      potentialTiles = [];
      potentialSymmetryTiles = [];
      clearPotentialHighlights();
//      console.log('mouse left ', $(this).data('x'), $(this).data('y'));
    })
    .on('mousedown', '.tile', function(e) {
      if (e.which==1) {
        var x = $(this).data('x');
        var y = $(this).data('y');
        if (!controlDown) {
          mouseDown = true;

          selectedTool.down(x,y)
          var change = selectedTool.speculateDrag(x,y);
          if (change) {
            applySymmetry(change);
            applyStep(change);
            selectedTool.stateChange();
          }
          
          e.preventDefault();
        }
      }
    })
    .on('mousemove', '.tile', function() {
      var x = $(this).data('x');
      var y = $(this).data('y');
      if (selectedTool && mouseDown) {
        var change = selectedTool.speculateDrag && selectedTool.speculateDrag(x,y);
        if (change) {
          applySymmetry(change);
          applyStep(change);
        } else if (selectedTool.speculateUp) {
          var st = selectedTool.getState();
          change = selectedTool.speculateUp(x,y);
          selectedTool.setState(st);
          if (change) setSpeculativeStep(change);
        }
      }
    })
    .on('mouseup', '.tile', function(e) {
      if (e.which==1) {
        var x = $(this).data('x');
        var y = $(this).data('y');
        if (controlDown) {
          var eyeDropBrushType = tiles[x][y].type;
          setBrushTileType(eyeDropBrushType);
        } else {
          var change = selectedTool.speculateUp(x,y);
          if (change) {
            applySymmetry(change);
            applyStep(change);
            selectedTool.stateChange();
          }
          selectedTool.up(x,y);
        
          savePoint();
        }
        mouseDown = false;
        cleanDirtyWalls();
      }
    });


  var wall = String.fromCharCode(120)+String.fromCharCode(120)+String.fromCharCode(120)+String.fromCharCode(255);
  var open = String.fromCharCode(212)+String.fromCharCode(212)+String.fromCharCode(212)+String.fromCharCode(255);
  function createPng() {
    var text = '';
    for (var y=0; y<height; y++) {
      for (var x=0; x<width; x++) {
        text += tiles[x][y].type.color;
      }
    }
    return text;
  }

  function makeLogic() {
    var logic = {
      info: {
        name: $('#mapName').val(),
        author: $('#author').val()
      },
      switches: {},
      fields: {},
      portals: {}
    };

    for (var x=0; x<width; x++) {
      for (var y=0; y<height; y++) {
        var fn = tiles[x][y].type.logicFn;
        if (fn) fn(logic, tiles[x][y])
      }
    }
    return logic;
  }

  function extractMap() {
    var map = {};
    map.tiles = [];
    for (var y=0; y<height; y++) {
      var row = map.tiles[y] = [];
      for (var x=0; x<width; x++) {
        var tile = tiles[x][y];
        var cell;
        if (tile.type == portalType) {
          cell = {
            type: tile.type.name,
            destination: tile.destination ? [tile.destination.x, tile.destination.y] : [x,y]
          }
        } else if (tile.type == switchType) {
          var targets = [];
          for (var key in tile.affected||[]) {
            var affected = tile.affected[key];
            targets.push([affected.x, affected.y])
          }
          cell = {
            type: tile.type.name,
            targets: targets
          }
        } else {
          cell = tile.type.name;
        }
        row[x] = cell;
      }
    }
    return map;
  }

  function getPngBase64() {
    return Base64.encode(generatePng(width, height, createPng()));
  }
  
  function getPngBase64Url() {
    return 'data:image/png;base64,' + getPngBase64();
  }

  $('#export').click(function() {
    $('.dropArea').removeClass('hasImportable');
    $('.dropArea').addClass('hasExportable');
    $(jsonDropArea).attr('href', 'data:application/json;base64,' + Base64.encode(JSON.stringify(makeLogic())));
    $(pngDropArea).attr('href', getPngBase64Url());
  });

  $('#save').click(function() {
    localStorage.setItem('png', getPngBase64Url());
    localStorage.setItem('json', JSON.stringify(makeLogic()));
  });

  function isValidMap() {
    var hasRedFlag = false;
    var hasBlueFlag = false;
    $.each(tiles, function(rowIdx, row) {
      $.each(row, function(tileIdx, tile) {
        if (tile.type.name == "redFlag") hasRedFlag = true;
        if (tile.type.name == "blueFlag") hasBlueFlag = true;
      });
    });
    return (hasRedFlag && hasBlueFlag);
  }

  $('#test').click(function() {
    var valid = isValidMap();
    if (!valid) {
      alert("A map requires at least one red flag and one blue flag to test.");
      return;
    }
    $.post('test', {logic: JSON.stringify(makeLogic()), layout: getPngBase64()}, function(data) {
      if (data && data.location) {
        window.open(data.location);
      } else {
        alert("Test couldn't get started.")
      }
      //console.log('back from test', data)
    });
  });
  
  function setBrushTileType(type) {
    $('.tileTypeSelectionIndicator').css('display', 'none');
    $('.tilePaletteOption').each(function(idx, el) {
      if ($(el).data('tileType') == type) {
        brushTileType = type;
        $(el).find('.tileTypeSelectionIndicator').css('display', 'inline-block');
      }
    })
  }

  var paletteRows = [
    [wallType, floorType, emptyType],
    [redFlagType, blueFlagType, redSpawnType, blueSpawnType],
    [speedpadType, redSpeedPadType, blueSpeedpadType, redFloorType, blueFloorType],
    [switchType, offFieldType, onFieldType, redFieldType, blueFieldType],
    [bombType, spikeType, powerupType, portalType]
  ]

  var brushTileType = paletteRows[0][0];
  

  $.each(paletteRows, function(rowIdx, row) {
    var $rowDiv = $("<div></div>");
    $.each(row, function(cellIdx, type) {
      var $button = $("<div class='tileBackground tilePaletteOption' title = '" + type.toolTipText + "'><div class='tile'><div class='tileTypeSelectionIndicator'></div></div></div>");
      $button.data('tileType', type);
      type.drawOn($button.find('.tile'));
      $button.click('click', function() {
        if (selectedTool == wire) {
          $('#toolPencil').trigger('click');
        }
        setBrushTileType(type);
      });
      $rowDiv.append($button);
    });
    $palette.append($rowDiv);
  })

  $('.tileTypeSelectionIndicator:first').css('display', 'inline-block');

  $('#toolPencil').data('tool', pencil);
  $('#toolBrush').data('tool', brush);
  $('#toolLine').data('tool', line);
  $('#toolRectFill').data('tool', rectFill);
  $('#toolRectOutline').data('tool', rectOutline);
  $('#toolCircleFill').data('tool', circleFill);
  $('#toolCircleOutline').data('tool', circleOutline);
  $('#toolFill').data('tool', fill);
  $('#toolWire').data('tool', wire);
  $('#tools .btn').click(function() {
    selectedTool.unselect.call(selectedTool);
    $('#tools .btn').removeClass('active');
    $(this).toggleClass('active');
    selectedTool = $(this).data('tool');
    selectedTool.select.call(selectedTool);
    potentialTiles = [];
  })

  var selectedTool = pencil;
  $('#toolPencil').toggleClass("active");
//  $('#toolPencil').trigger('click');

  $('#undo').click(undo);
  $('#redo').click(redo);

  var importJson;
  var importPng;
  //$jsonDrop.ondragover = function () { this.className = 'hover'; return false; };
  //$jsonDrop.ondragend = function () { this.className = ''; return false; };
  var jsonDropArea = document.getElementById('jsonDrop')
  jsonDropArea.ondragover = function () { return false; };
  jsonDropArea.ondragend = function () { return false; };

  jsonDropArea.addEventListener("dragstart",function(evt){
    evt.dataTransfer.setData("DownloadURL",
      'data:application/json;base64,' + Base64.encode(JSON.stringify(makeLogic())));
    return false;
  },false);

  var pngDropArea = document.getElementById('pngDrop');
  pngDropArea.ondragover = function () { return false; };
  pngDropArea.ondragend = function () { return false; };

  jsonDropArea.ondrop = pngDropArea.ondrop = function (e) {
    e.preventDefault();
    $('.dropArea').removeClass('hasExportable');
    for (var i=0; i<e.dataTransfer.files.length; i++) {
      var file = e.dataTransfer.files[i],
        reader = new FileReader();

      if (file.name.match(/json$/i)) {
        reader.onload = function (event) {
          importJson = event.target.result;
          $(jsonDropArea).addClass('hasImportable');
        };
        reader.readAsText(file);
      } else if (file.name.match(/png$/i)) {
        reader.onload = function (event) {
          importPng = event.target.result;
          $(pngDropArea).addClass('hasImportable');
        }
        reader.readAsDataURL(file);
      } else {
        alert('Expected a PNG or a JSON, but got ' + file.name);
      }
    }

    return false;
  };
  function restoreFromPngAndJson(pngBase64, jsonString, optWidth, optHeight, doHistoryClear) {
    var canvas = document.getElementById('importCanvas');
    var ctx = canvas.getContext('2d');
    var json = JSON.parse(jsonString);
    var img = new Image();
    img.onload = function() {
      var w = img.width;
      var h = img.height;
      optWidth = optWidth || w;
      optHeight = optHeight || h;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img,0,0);
      var imgd = ctx.getImageData(0, 0, w, h).data;
      var typeByColor = {};
      tileTypes.forEach(function(type) {
        typeByColor[type.rgb] = type;
      })

      var fields = json.fields || {};
      var cols = [];
      for (var x=0; x<optWidth; x++) {
        var col = [];
        for (var y=0; y<optHeight; y++) {
          var type;
          if (x<w && y<h) {
            var i = (y*w + x)*4;
            var pixel = imgd[i] | (imgd[i+1]<<8) | (imgd[i+2]<<16);
            type = typeByColor[pixel] || emptyType;
            if (type == onFieldType || type==offFieldType || type==redFieldType || type==blueFieldType) {
              type = {on: onFieldType, off: offFieldType, red: redFieldType, blue: blueFieldType
              }[(fields[x+','+y]||{}).defaultState] || offFieldType;
            }
          } else {
            type = emptyType;
          }
          col.push(type);
        }
        cols.push(col);
      }
      buildTilesWith(cols);

      var info = json.info || {};
      $('#mapName').val(info.name || '');
      $('#author').val(info.author || '');

      var portals = json.portals || {};
      for (var key in portals) {
        var xy = key.split(',');
        var tile = (tiles[xy[0]]||[])[xy[1]];
        if (tile && tile.type==portalType) {
          var dest = portals[key].destination||{};
          tile.destination = (tiles[dest.x]||[])[dest.y];
        }
      }

      var switches = json.switches || {};
      for (var key in switches) {
        var xy = key.split(',');
        var tile = (tiles[xy[0]]||[])[xy[1]];
        if (tile && tile.type == switchType) {
          tile.affected = []
          var toggles = (switches[key].toggle||[]);
          toggles.forEach(function(affected) {
            var pos = affected.pos || {};
            var affectedTile = (tiles[pos.x]||[])[pos.y];
            if (affectedTile) tile.affected[pos.x + ',' + pos.y] = (affectedTile);
          });
        }
      }

      savePoint();
      if (doHistoryClear) clearHistory();
    }
    img.src = pngBase64;//'https://mdn.mozillademos.org/files/5397/rhino.jpg';
  }
  
  function clearHistory() {
    undoSteps = redoSteps = []
    enableUndoRedoButtons();
  }

  $('#import').click(function() {
    if (importPng && importJson) {
      restoreFromPngAndJson(
        importPng,
        importJson, undefined, undefined, true);
    } else {
      alert('Please drag and drop a PNG and a JSON to import onto their receptacles.')
    }
  });

  function resizeTo(width, height) {
    var png = getPngBase64Url();
    var json = JSON.stringify(makeLogic());

    restoreFromPngAndJson(png, json, width, height);
  }

  $('#resize').click(function(e) {
    var width = parseInt($('#resizeWidth').val(), 10);
    var height = parseInt($('#resizeHeight').val(), 10);

    if (width * height > 3600) {
      if (!confirm('It\'s currently not possible to test maps larger than 3600 tiles.\nVery large maps can (will) lag your browser as well.\nAre you sure you want to resize?')) {
        $('#resizeWidth').val(tiles.length);
        $('#resizeHeight').val(tiles[0].length);
        e.preventDefault();
        return;
      }
    } else if ( width < 1 || height < 1) {
      alert('Min width/height is 1.');
      width = Math.max(1, width);
      height = Math.max(1, height);
    }
    resizeTo(width, height);
    e.preventDefault();
  });
  
  function showZoom() {
    tileSize = [10,20,30,40][zoom];
    var sizeCss = tileSize + 'px';
    var singleTileBackgroundSize = sizeCss + ' ' + sizeCss;
    
    function applySize(e) {
      e.style.width = e.style.height = sizeCss;
    }
    
    for (var x=0; x<tiles.length; x++) {
      for (var y=0; y<tiles[0].length; y++) {
        var tile = tiles[x][y];
        var typeIndicator = tile.elem[0];
        var bg = typeIndicator.parentNode;
        if (x==0) {
          var row = bg.parentNode;
          row.style.height = sizeCss;
        }
        applySize(tile.affectedIndicator);
        applySize(tile.selectionIndicator);
        tile.selectionIndicator.style.backgroundSize = singleTileBackgroundSize;
        applySize(tile.elem[0]);
        applySize(tile.background[0]);
        
        tile.type.drawOn(tile.elem, tile);
        floorType.drawOn(tile.background, null);
      }
    }
  }
  
  $('#clear').click(function() {
    if (confirm('Are you sure you want to clear the map?')) {
      clearMap();
    }
  });
  
  function enableZoomButtons() {
    enable($('#zoomIn'), zoom<maxZoom);
    enable($('#zoomOut'), zoom>0);
  }
  $('#zoomIn').click(function() {
    zoom = Math.min(maxZoom, zoom+1);
    showZoom();
    enableZoomButtons();
  });
  $('#zoomOut').click(function() {
    zoom = Math.max(0, zoom-1);
    showZoom();
    enableZoomButtons();
  });
  enableZoomButtons();
  
  $('#dropHelp').click(function() {
    alert("Importing Map:\n" +
      "Drag a .png file and a .json file from your file manager onto their respective squares. When both are added, hit Import to apply them to the current map.\n\n" +
      "Exporting Map:\n" +
      "Hit Export. The .png and .json files can then be dragged or clicked from their respective squares.")
  })
  
  var savedPng = localStorage.getItem('png')
  var savedJson = localStorage.getItem('json')
  restoreFromPngAndJson(savedPng, savedJson, undefined, undefined, true);
});
