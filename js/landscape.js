import { Mulberry32, SimplexNoise, polarToCartesian } from './utils.js';

export const LandscapeConfig = {
    resolution: 450,
    renderScale: 6, // Multiplier for canvas size relative to max dimension
    lakeNode: 'james',
    lakeDepth: 3.0,
    lakeLevelOffset: 1.2,
    p: 2, // IDW power parameter
};

export class LandscapeGenerator {
    constructor(seed) {
        this.seed = seed;
        this.rng = new Mulberry32(seed);
        this.noise = new SimplexNoise(() => this.rng.next());
    }

    // Generate the collision mask for ski vs off-piste areas
    generateCollisionMask(links, width, height) {
        const renderSize = Math.max(width, height) * LandscapeConfig.renderScale;
        const resolution = LandscapeConfig.resolution;
        const cellSize = renderSize / resolution;
        
        // Collision canvas setup
        const colRes = resolution * 2;
        const colScale = colRes / renderSize;
        
        const canvas = document.createElement('canvas');
        canvas.width = colRes;
        canvas.height = colRes;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        ctx.translate(colRes/2, colRes/2);
        ctx.scale(colScale, colScale);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000';
        
        const linkGen = d3.linkRadial()
            .angle(d => d.x)
            .radius(d => d.y)
            .context(ctx);
            
        links.forEach(d => {
            if (d.styleType === 'run') {
                ctx.lineWidth = 120;
            } else {
                ctx.lineWidth = 50;
            }
            ctx.beginPath();
            
            if (d.styleType === 'lift-drag') {
                const s = polarToCartesian(d.source.x, d.source.y);
                const t = polarToCartesian(d.target.x, d.target.y);
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(t.x, t.y);
            } else {
                linkGen(d);
            }

            ctx.stroke();
        });
        
        const colData = ctx.getImageData(0, 0, colRes, colRes).data;
        
        return {
            check: (x, y) => {
                const cx = Math.floor(x * colScale + colRes/2);
                const cy = Math.floor(y * colScale + colRes/2);
                if (cx < 0 || cx >= colRes || cy < 0 || cy >= colRes) return false;
                const idx = (cy * colRes + cx) * 4 + 3;
                return colData[idx] > 10;
            },
            cellSize,
            renderSize
        };
    }

    // Generate height map using IDW
    generateHeightMap(root, width, height) {
        const renderSize = Math.max(width, height) * LandscapeConfig.renderScale;
        const resolution = LandscapeConfig.resolution;
        const cellSize = renderSize / resolution;
        
        // Pre-calculate node positions and elevations
        const nodes = root.descendants().map(d => {
            const pos = polarToCartesian(d.x, d.y);
            let z = d.elevation || 0;
            if (d.data.name === LandscapeConfig.lakeNode) {
                z -= LandscapeConfig.lakeDepth;
            }
            return { x: pos.x, y: pos.y, z };
        });

        let minZ = Infinity, maxZ = -Infinity;
        nodes.forEach(n => {
            if (n.z < minZ) minZ = n.z;
            if (n.z > maxZ) maxZ = n.z;
        });
        
        const values = new Float32Array(resolution * resolution);

        // Scale smoothing factor based on layout dimensions to maintain lake features on small screens
        const minDim = Math.min(width, height);
        const smoothingFactor = Math.max(10, Math.pow(minDim, 2) / 1000);
        
        // Helper for single point height calculation
        const calculateHeight = (x, y) => {
            let numerator = 0;
            let denominator = 0;
            let minDist = Infinity;
            
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const distSq = (x - node.x) ** 2 + (y - node.y) ** 2;
                const dist = Math.sqrt(distSq);
                
                if (dist < 0.1) return node.z;
                if (dist < minDist) minDist = dist;

                const weight = 1 / (distSq + smoothingFactor);
                numerator += weight * node.z;
                denominator += weight;
            }
            
            let h = numerator / denominator;
            const nx = x * 0.005;
            const ny = y * 0.005;
            const n = this.noise.noise2D(nx, ny);
            return h + n * 0.5;
        };

        for (let j = 0; j < resolution; j++) {
            for (let i = 0; i < resolution; i++) {
                const wx = (i - resolution/2) * cellSize;
                const wy = (j - resolution/2) * cellSize;
                values[j * resolution + i] = calculateHeight(wx, wy);
            }
        }

        return {
            values,
            minZ,
            maxZ,
            lakeLevel: minZ + LandscapeConfig.lakeLevelOffset,
            cellSize,
            resolution,
            calculateHeight // Exposed for feature placement
        };
    }

    // Generate textures for rock and snow layers
    generateTextures(heightMapData, maskData) {
        const { values, minZ, maxZ, resolution, cellSize } = heightMapData;
        const zRange = Math.max(0.1, maxZ - minZ);

        const rockCanvas = document.createElement('canvas');
        rockCanvas.width = resolution;
        rockCanvas.height = resolution;
        const rockCtx = rockCanvas.getContext('2d');
        const rockData = rockCtx.createImageData(resolution, resolution);

        const snowCanvas = document.createElement('canvas');
        snowCanvas.width = resolution;
        snowCanvas.height = resolution;
        const snowCtx = snowCanvas.getContext('2d');
        const snowData = snowCtx.createImageData(resolution, resolution);

        // Light direction
        const lx = -1, ly = -1, lz = 1.5;
        const lLen = Math.sqrt(lx*lx + ly*ly + lz*lz);
        const nlx = lx/lLen, nly = ly/lLen, nlz = lz/lLen;
        const zScale = 4.0;

        for (let j = 0; j < resolution; j++) {
            for (let i = 0; i < resolution; i++) {
                const wx = (i - resolution/2) * cellSize;
                const wy = (j - resolution/2) * cellSize;
                const idx = (j * resolution + i) * 4;
                const h = values[j * resolution + i];
                const isSkiArea = maskData.check(wx, wy);

                // Normal calculation
                const i0 = Math.max(0, i-1), i1 = Math.min(resolution-1, i+1);
                const j0 = Math.max(0, j-1), j1 = Math.min(resolution-1, j+1);
                const dzdx = (values[j*resolution + i1] - values[j*resolution + i0]) / ((i1-i0) * cellSize);
                const dzdy = (values[j1*resolution + i] - values[j0*resolution + i]) / ((j1-j0) * cellSize);

                const nx = -dzdx * zScale;
                const ny = -dzdy * zScale;
                const nz = 1;
                const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
                const diffuse = (nx*nlx + ny*nly + nz*nlz) / nLen;
                const intensity = Math.max(0, Math.min(1, diffuse));

                let normH = (h - minZ) / zRange;
                normH = Math.max(0, Math.min(1, normH));
                
                const levels = 12;
                const quantized = Math.floor(normH * levels) / levels;

                if (isSkiArea) {
                    const light = Math.pow(intensity, 0.7);
                    let r = 200 + light * 55;
                    let g = 230 + light * 25;
                    let b = 255;
                    const band = quantized * 10;
                    r += band; g += band; b += band;
                    
                    snowData.data[idx] = Math.min(255, r);
                    snowData.data[idx+1] = Math.min(255, g);
                    snowData.data[idx+2] = Math.min(255, b);
                    snowData.data[idx+3] = 255;
                    rockData.data[idx+3] = 0;
                } else {
                    let base = 260;
                    const textureScale = 1;
                    const textureVal = this.noise.noise2D(wx * textureScale, wy * textureScale);
                    base = base - (1-quantized);
                    
                    let r, g, b;
                    if (textureVal > 0.5) {
                        r = base * 0.94; g = base * 0.96; b = base;
                    } else {
                        r = base * 0.8; g = base * 0.96; b = base;
                    }
                    
                    rockData.data[idx] = r;
                    rockData.data[idx+1] = g;
                    rockData.data[idx+2] = b;
                    rockData.data[idx+3] = 255;
                    snowData.data[idx+3] = 0;
                }
            }
        }

        rockCtx.putImageData(rockData, 0, 0);
        snowCtx.putImageData(snowData, 0, 0);

        return {
            rockUrl: rockCanvas.toDataURL(),
            snowUrl: snowCanvas.toDataURL(),
            imageSize: resolution * cellSize
        };
    }

    getScatteredFeatures(heightMapData, maskData, width, height) {
        const { calculateHeight, lakeLevel, minZ, maxZ } = heightMapData;
        const zRange = Math.max(0.1, maxZ - minZ);
        const maxR = 2.0 * Math.max(width, height);
        
        const boulders = [];
        const trees = [];
        
        // Helper to scatter points
        const scatter = (count, seedOffset, checkFn, resultList) => {
            for(let k=0; k<count; k++) {
                const particleSeed = this.seed + seedOffset + k;
                const rng = new Mulberry32(particleSeed);

                const r = Math.sqrt(rng.next()) * maxR * 1.5;
                const theta = rng.next() * 2 * Math.PI;
                const x = r * Math.cos(theta);
                const y = r * Math.sin(theta);
                
                if (maskData.check(x, y)) continue;
                if (checkFn && !checkFn(x, y)) continue;
                
                resultList.push({ x, y, rng });
            }
        };

        // Boulders
        scatter(12000, 100000, (x, y) => {
            const h = calculateHeight(x, y);
            return h > lakeLevel + 0.2;
        }, boulders);

        // Trees
        scatter(50000, 200000, (x, y) => {
            const h = calculateHeight(x, y);
            if (h <= lakeLevel + 0.2) return false;
            const normH = (h - minZ) / zRange;
            if (normH <= 0.5) return false;
            const n = this.noise.noise2D(x*0.01, y*0.01);
            return n > 0;
        }, trees);

        return { boulders, trees };
    }
}
