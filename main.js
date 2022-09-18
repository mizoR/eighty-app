import * as THREE from 'three';
import { FlyControls } from "three/examples/jsm/controls/FlyControls";
import GUI from 'lil-gui';

const EIGHTY = {
  Coord: class {
    constructor(latitude, longitude) {
      this.latitude = latitude;
      this.longitude = longitude;
    }

    static fromTile(tile) {
      return [tile.northWest(), tile.southEast()];
    }
  },

  Tile: class {
    constructor(zoom, x, y) {
      this.zoom = zoom;
      this.x = x;
      this.y = y;
    }

    northWest() {
      const mapy = (this.y / (2 ** this.zoom)) * 2 * Math.PI - Math.PI;
      const latitude = 2 * Math.atan(Math.E ** (-mapy)) * 180 / Math.PI - 90;
      const longitude = (this.x / (2 ** this.zoom)) * 360 - 180;

      return new EIGHTY.Coord(latitude, longitude);
    }

    southEast() {
      const tile = new EIGHTY.Tile(this.zoom, this.x + 1, this.y + 1);

      return tile.northWest();
    }

    createMesh() {
      const coords = EIGHTY.Coord.fromTile(this);

      console.log(`Creating tile mesh - ${this.zoom}/${this.x}/${this.y} - (${coords[0].latitude},${coords[0].longitude})/(${coords[1].latitude},${coords[1].longitude})`);

      const demUrl = `https://cyberjapandata.gsi.go.jp/xyz/dem/${this.zoom}/${this.x}/${this.y}.txt`;

      const demRequest = new XMLHttpRequest();

      const COMPRESS_LEVEL = 1; // 2の累乗

      const MAX_MESH_SIZE = 255;

      const MESH_SIZE = (MAX_MESH_SIZE + 1) / COMPRESS_LEVEL - 1;

      demRequest.open('GET', demUrl, false);

      const demText = function (request) {
        request.send(null);

        if (demRequest.status == 200) {
          return demRequest.responseText;
        } else if (demRequest.status === 404) {
          const line = Array(MAX_MESH_SIZE + 1).fill('e').join(',');

          return Array(MAX_MESH_SIZE + 1).fill(line).join("\n");
        } else {
          throw `Failed to fetch DEM: ${this.zoom}/${this.x}/${this.y}`;
        };
      }(demRequest);

      const heights = demText.trim().split("\n").map((line) => {
        return line.trim().split(",").map((s) => parseFloat(s) || 0.0);
      }).reverse();

      const bufferGeometry = new THREE.BufferGeometry();

      const positionArray = new Float32Array(3 * (MESH_SIZE + 1) * (MESH_SIZE + 1));

      let i = 0;
      for (let z = 0; z < MESH_SIZE + 1; z++) {
        const positionZ = -(1 / MESH_SIZE * z) + 0.5;

        for (let x = 0; x < MESH_SIZE + 1; x++) {
          positionArray[i++] = (1 / MESH_SIZE * x) - 0.5;
          // NOTE: 赤道付近の距離で高さが計算されてしまっているので厳密には修正が必要
          positionArray[i++] = heights[z * COMPRESS_LEVEL][x * COMPRESS_LEVEL] * (2 ** this.zoom) / 40075000;
          positionArray[i++] = positionZ;
        }
      }

      const uvArray = new Float32Array(2 * (MESH_SIZE + 1) * (MESH_SIZE + 1));

      i = 0;

      for (let x = 0; x < MESH_SIZE + 1; x++) {
        for (let z = 0; z < MESH_SIZE + 1; z++) {
          uvArray[i++] = 1.0 / MESH_SIZE * z;
          uvArray[i++] = 1.0 / MESH_SIZE * x;
        }
      }

      let index = new Array(MESH_SIZE * MESH_SIZE * 6)

      i = 0;

      for (let z = 0; z < MESH_SIZE; z++) {
        for (let x = 0; x < MESH_SIZE; x++) {
          index[i++] = (MESH_SIZE + 1) * z + x;
          index[i++] = (MESH_SIZE + 1) * z + x + 1
          index[i++] = (MESH_SIZE + 1) * z + x + MESH_SIZE + 1;

          index[i++] = (MESH_SIZE + 1) * z + x + MESH_SIZE + 1
          index[i++] = (MESH_SIZE + 1) * z + x + 1;
          index[i++] = (MESH_SIZE + 1) * z + x + MESH_SIZE + 2;
        }
      }

      bufferGeometry.setIndex(index);

      bufferGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positionArray, 3)
      );

      bufferGeometry.setAttribute(
        'uv',
        new THREE.BufferAttribute(uvArray, 2)
      );

      // テクスチャを作成
      const textureLoader = new THREE.TextureLoader();

      const textureUrl = `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${this.zoom}/${this.x}/${this.y}.jpg`;

      const texture = textureLoader.load(textureUrl);

      // マテリアルを作成
      const bufferMaterial = new THREE.MeshBasicMaterial({
        map: texture,
      });

      // メッシュを作成
      const bufferMesh = new THREE.Mesh(bufferGeometry, bufferMaterial);

      return bufferMesh;
    }

    static fromCoord(zoom, coord) {
      const degrees2meters = function (lat, lon) {
        var x = lon * 20037508.34 / 180.0;
        var y = Math.log(Math.tan((90.0 + lat) * Math.PI / 360.0)) / (Math.PI / 180.0);

        y = y * 20037508.34 / 180.0;

        return [x, y]
      }

      const GEO_R = 6378137;
      const orgX = -1 * (2 * GEO_R * Math.PI / 2);
      const orgY = (2 * GEO_R * Math.PI / 2);
      const xy = degrees2meters(coord.latitude, coord.longitude);
      const unit = 2 * GEO_R * Math.PI / Math.pow(2, zoom)
      const tileX = Math.floor((xy[0] - orgX) / unit);
      const tileY = Math.floor((orgY - xy[1]) / unit);

      return new EIGHTY.Tile(zoom, tileX, tileY);
    }
  },

  Ground: class {
    constructor(scene, camera, centerTile) {
      this.scene = scene;
      this.camera = camera;
      this.centerTile = centerTile;
    }

    update(config, callback) {
      if (this.updating) return;

      const isSync = config.sync;

      this.updating = true;

      const tileSides = 5;

      const i0 = Math.floor(this.camera.position.x);
      const j0 = Math.floor(this.camera.position.z);

      let args = [];

      for (let i = -tileSides + i0; i <= tileSides + i0; i++) {
        for (let j = -tileSides + j0; j <= tileSides + j0; j++) {
          let mesh = this.findTileMesh(i, j);

          if (mesh) continue;

          args.push([i, j]);
        }
      }

      var that = this;

      const func = function () {
        const argument = args.pop();

        if (!argument) {
          for (const i in that.tileMeshes) {
            for (const j in that.tileMeshes[i]) {
              const shouldDelete = (i < i0 - tileSides - 2) || (i > i0 + tileSides + 2) || (j < j0 - tileSides - 2) || (j > j0 + tileSides + 2);

              if (shouldDelete) {
                console.log(`Deleting tile mesh - (${i},${j})`);
                const tileMesh = that.tileMeshes[i][j];
                that.scene.remove(tileMesh);
                tileMesh.material.map.dispose();
                tileMesh.material.dispose();
                tileMesh.geometry.dispose();
                delete that.tileMeshes[i][j];
              }
            }
          }
          that.updating = false;

          callback();

          return;
        }

        const mesh = that.createTileMesh(argument[0], argument[1]);

        that.scene.add(mesh);

        if (isSync) {
          setTimeout(func, 0)
        } else {
          setTimeout(func, 200)
        }
      };

      if (isSync) {
        setTimeout(func, 10);
      } else {
        setTimeout(func, 10);
      }

      return true;
    }

    findTileMesh(i, j) {
      this.tileMeshes ||= {};
      this.tileMeshes[i] ||= {};

      return this.tileMeshes[i][j];
    }

    createTileMesh(i, j) {
      this.tileMeshes ||= {};
      this.tileMeshes[i] ||= {};

      const tileMesh = new EIGHTY.Tile(this.centerTile.zoom, this.centerTile.x + i, this.centerTile.y + j).createMesh();

      tileMesh.geometry.translate(i, 0, j);

      this.tileMeshes[i][j] ||= tileMesh;


      return this.tileMeshes[i][j];
    }
  },

  App: class {
    constructor(config) {
      console.log('Initialize App');

      this.zoom = config.zoom;
      this.coord = config.coord;
      this.tile = EIGHTY.Tile.fromCoord(this.zoom, this.coord);
    };

    start() {
      console.log("Start world");

      const centerTile = this.tile;

      let ground;

      let gui, scene, camera, renderer, controls;

      window.addEventListener('load', init);

      function onWindowResize() {
        renderer.setSize(window.innerWidth, window.innerHeight);

        camera.aspect = window.innerWidth / window.innerHeight;

        camera.updateProjectionMatrix();
      }

      function init() {
        scene = new THREE.Scene();

        scene.background = new THREE.Color(0xa0d8ef);

        scene.fog = new THREE.Fog(0xa0d8ef, 1, 5);

        // gui = new GUI();
        // gui.add(scene.fog, "far").name('fog.far').min(2).max(100);

        // 座標系
        // const axesHelper = new THREE.AxesHelper(25);
        // scene.add(axesHelper);

        // カメラを追加
        camera = new THREE.PerspectiveCamera(
          50,
          window.innerWidth / window.innerHeight,
          0.1,
          1000
        );

        camera.position.set(0.0, 0.5 / (2 ** (12 - centerTile.zoom)), 0.9);

        // レンダラーを追加
        renderer = new THREE.WebGLRenderer();

        renderer.setSize(window.innerWidth, window.innerHeight);

        renderer.setPixelRatio(window.devicePixelRatio);

        document.body.appendChild(renderer.domElement);

        // タイルの作成
        ground = new EIGHTY.Ground(scene, camera, centerTile);

        ground.update({ sync: true }, function () {
          window.addEventListener('resize', onWindowResize);

          document.getElementById("loading").style.display = "none";

          // マウス操作
          controls = new FlyControls(camera, renderer.domElement);
          controls.movementSpeed = 0.03;
          controls.rollSpeed = 0.05;
          controls.autoForward = true;

          animate();
        });
      }

      let frames = 0;

      function animate() {
        frames++;

        controls.update(0.05);

        renderer.render(scene, camera);

        if (frames % 100 == 1) {
          // 地表を作成する
          setTimeout(function () {
            ground.update({ sync: false }, function () {
              console.log('Tiles updated');
            });
          }, 0);
        }

        requestAnimationFrame(animate);
      }
    }
  },
};

(function () {
  const url = new URL(window.location);

  const params = new URLSearchParams(url.search);

  const matches = /@(\d+\.\d+),(\d+\.\d+),(\d\d?)z$/.exec(params.get('c'));

  const DEFAULT_COORD = new EIGHTY.Coord(35.360626, 138.727363)

  const DEFAULT_ZOOM = 12;

  let specifiedCoord = DEFAULT_COORD;

  let specifiedZoom = DEFAULT_ZOOM;

  if (matches) {
    const latitude = parseFloat(matches[1]);
    const longitude = parseFloat(matches[2]);
    const zoom = parseInt(matches[3]);
    const isValid = (latitude >= -90 && latitude <= 90) &&
      (longitude >= -180 && longitude <= 180) &&
      (specifiedZoom >= 10 && specifiedZoom <= 14);

    if (isValid) {
      specifiedCoord = new EIGHTY.Coord(latitude, longitude);
      specifiedZoom = zoom;
    } else {
      console.warn(`Invalid parameters: @${latitude},${longitude},${zoom}z`);

      specifiedCoord = DEFAULT_COORD;
      specifiedZoom = DEFAULT_ZOOM;
    }
  }

  const app = new EIGHTY.App({
    zoom: specifiedZoom,
    coord: specifiedCoord,
  });

  app.start()
})();
