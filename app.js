import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

let scene, camera, renderer;
let controller, reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

// Measurement State
let points =[]; // Will store point A and point B
let markers =[]; // Spheres dropped on the screen
let line = null; // The visual line between points

// UI Elements
const measurementText = document.getElementById('measurement-text');
const instructions = document.getElementById('instructions');
const resetButton = document.getElementById('reset-button');

init();

function init() {
    // 1. Setup Scene and Camera
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    
    // 2. Add Lighting
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // 3. Setup Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true; // Turn on WebXR
    document.body.appendChild(renderer.domElement);

    // 4. Add the AR Button to the DOM (Requesting Hit-Test and DOM Overlay)
    document.body.appendChild(ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.getElementById('overlay') }
    }));

    // 5. Create the Reticle (Targeting crosshair)
    const reticleGeometry = new THREE.RingGeometry(0.015, 0.02, 32).rotateX(-Math.PI / 2);
    const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // 6. Setup the Controller (Handles Taps)
    controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    // Reset Button Event Listener
    resetButton.addEventListener('click', resetMeasurement);

    // Resize Handler
    window.addEventListener('resize', onWindowResize);

    // Start the Render Loop
    renderer.setAnimationLoop(render);
}

function onSelect() {
    // Don't do anything if we can't see the reticle (no surface found)
    if (!reticle.visible) return;

    // Get the exact 3D position of the reticle
    const position = new THREE.Vector3();
    position.setFromMatrixPosition(reticle.matrix);

    if (points.length === 0) {
        // --- POINT A PLACED ---
        points.push(position.clone());
        addMarker(position);
        instructions.innerText = "Aim and tap to place Point B";
        
        // Initialize the dynamic line
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([position, position]);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 5 });
        line = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(line);
        
    } else if (points.length === 1) {
        // --- POINT B PLACED ---
        points.push(position.clone());
        addMarker(position);
        instructions.innerText = "Measurement complete!";
        
        // Finalize line position
        line.geometry.setFromPoints([points[0], points[1]]);
    }
}

function addMarker(position) {
    const geometry = new THREE.SphereGeometry(0.01, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    scene.add(sphere);
    markers.push(sphere);
}

function resetMeasurement() {
    points =[];
    markers.forEach(marker => scene.remove(marker));
    markers =[];
    if (line) {
        scene.remove(line);
        line = null;
    }
    measurementText.innerText = "0.0 cm";
    instructions.innerText = "Aim at the floor/table to start";
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 7. The Render Loop (Runs 60 times a second)
function render(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        // Request Hit Test Setup
        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then((viewerSpace) => {
                session.requestHitTestSource({ space: viewerSpace }).then((source) => {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', () => {
                hitTestSourceRequested = false;
                hitTestSource = null;
                resetMeasurement();
            });
            hitTestSourceRequested = true;
        }

        // Process Hit Testing
        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(referenceSpace);

                // Show reticle and map it to the real-world surface
                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);

                // If Point A is placed, calculate dynamic distance and update line
                if (points.length === 1) {
                    const currentPos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
                    
                    // Math: Calculate distance between Point A and Reticle
                    const distanceMeters = points[0].distanceTo(currentPos);
                    const distanceCm = (distanceMeters * 100).toFixed(1);
                    
                    // Update UI and dynamic Line
                    measurementText.innerText = `${distanceCm} cm`;
                    line.geometry.setFromPoints([points[0], currentPos]);
                }
            } else {
                reticle.visible = false;
            }
        }
    }
    renderer.render(scene, camera);
}
