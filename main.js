import * as THREE from 'three';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import GUI from 'lil-gui';

const gui = new GUI();

let scene, camera, renderer, pointLight, controls;

window.addEventListener('load', init);

function init() {
  // シーンを追加
  scene = new THREE.Scene();

  // カメラを追加
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  camera.position.set(0, 0, 5);

  // レンダラーを追加
  renderer = new THREE.WebGLRenderer();

  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.setPixelRatio(window.devicePixelRatio);

  document.body.appendChild(renderer.domElement);

  // ジオメトリを作成
  // let ballGeometry = new THREE.SphereGeometry(100, 64, 32);
  // 
  // // マテリアルを作成
  // let ballMaterial = new THREE.MeshPhysicalMaterial({ color: "blue" });
  // 
  // // メッシュ化
  // let ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
  // 
  // scene.add(ballMesh);

  const bufferGeometry = new THREE.BufferGeometry();

  const positionArray = new Float32Array(9);

  positionArray[0] = 0;
  positionArray[1] = 0;
  positionArray[2] = 0;

  positionArray[3] = 0;
  positionArray[4] = 1;
  positionArray[5] = 0;

  positionArray[6] = 1;
  positionArray[7] = 0;
  positionArray[8] = 0;

  const positionAttribute = new THREE.BufferAttribute(positionArray, 3);

  bufferGeometry.setAttribute('position', positionAttribute);

  const bufferMaterial = new THREE.MeshBasicMaterial({
    wireframe: true
  });

  const bufferMesh = new THREE.Mesh(bufferGeometry, bufferMaterial);

  scene.add(bufferMesh);

  //平行光源を追加
  let directionalLight = new THREE.DirectionalLight(0xffffff, 2);

  directionalLight.position.set(1, 1, 1);

  scene.add(directionalLight);

  // ポイント光源を追加
  pointLight = new THREE.PointLight(0xffffff, 1);

  pointLight.position.set(-200, -200, -200);

  scene.add(pointLight);

  // ポイント光源がどこにあるかを特定する
  let pointLightHelper = new THREE.PointLightHelper(pointLight, 30);

  scene.add(pointLightHelper);

  // マウス操作
  controls = new OrbitControls(camera, renderer.domElement);

  animate();
}
function animate() {
  // ポイント光源を巡回
  pointLight.position.set(
    200 * Math.sin(Date.now() / 500),
    200 * Math.sin(Date.now() / 1000),
    200 * Math.cos(Date.now() / 500)
  );

  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}
