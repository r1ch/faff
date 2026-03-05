import questions from '../questions.js';
import { Mulberry32, SimplexNoise, polarToCartesian } from '../utils.js';
import { LandscapeGenerator, LandscapeConfig } from '../landscape.js';

export default {
    props: ['currentPath', 'choices'],
    template: '<div id="background-graph"></div>',
    data() {
        return {
            lastWidth: window.innerWidth,
            seed: Date.now() // Seed once on creation
        }
    },
    mounted() {
        this.initGraph();
        window.addEventListener('resize', this.handleResize);
    },
    beforeUnmount() {
        window.removeEventListener('resize', this.handleResize);
    },
    methods: {
        buildTreeData(nodeId, visited = new Set()) {
            if (!questions[nodeId]) return null;
            if (visited.has(nodeId)) return null; // Avoid infinite cycles

            const newVisited = new Set(visited);
            newVisited.add(nodeId);

            let node = { 
                name: nodeId, 
                ...questions[nodeId],
                children: [] 
            };

            if (questions[nodeId].answers) {
                node.children = questions[nodeId].answers.map(answer => {
                    const child = this.buildTreeData(answer.next, newVisited);
                    if (child) {
                        child.edgeLabel = answer.text;
                    }
                    return child;
                }).filter(n => n !== null);
            }

            return node;
        },
        drawLandscape(svg, width, height, links, root) {
            const g = svg.append("g").attr("class", "landscape");
            const landscape = new LandscapeGenerator(this.seed);
            
            // 1. Generate Collision Mask (Ski Area vs Off-Piste)
            const maskData = landscape.generateCollisionMask(links, width, height);
            
            // 2. Generate Height Map
            const heightMapData = landscape.generateHeightMap(root, width, height);
            
            // 3. Generate Textures
            const textures = landscape.generateTextures(heightMapData, maskData);
            
            // Draw Textures
            const imageSize = textures.imageSize;
            
            // Rock Layer
            g.append("image")
                .attr("href", textures.rockUrl)
                .attr("x", -imageSize/2)
                .attr("y", -imageSize/2)
                .attr("width", imageSize)
                .attr("height", imageSize)
                .attr("class", "landscape-rock-layer");
                
            // Snow Layer
            g.append("image")
                .attr("href", textures.snowUrl)
                .attr("x", -imageSize/2)
                .attr("y", -imageSize/2)
                .attr("width", imageSize)
                .attr("height", imageSize)
                .attr("class", "landscape-snow-layer");
            
            // 4. Draw Lake
            // Invert values for lake contour (below threshold)
            const { values, lakeLevel, cellSize, resolution } = heightMapData;
            const invertedValues = new Float32Array(values.length);
            for(let i=0; i<values.length; i++) invertedValues[i] = -values[i];
            
            const lakeContour = d3.contours()
                .size([resolution, resolution])
                .thresholds([-lakeLevel])
                (invertedValues);

            const contours = d3.contours()
                .size([resolution, resolution])
                .thresholds(12)
                (values);
            
            const projection = d3.geoIdentity()
                .scale(cellSize)
                .translate([-imageSize/2, -imageSize/2]);
            
            const path = d3.geoPath(projection);
            
            g.append("g")
                .attr("class", "landscape-lake")
                .selectAll("path")
                .data(lakeContour)
                .enter().append("path")
                    .attr("d", path)
                    .attr("fill", "rgba(65, 105, 225, 0.5)")
                    .attr("stroke", "none");

            g.append("g")
                .attr("class", "landscape-contours")
                .selectAll("path")
                .data(contours)
                .enter().append("path")
                    .attr("d", path);

            // 5. Scatter Features
            const features = landscape.getScatteredFeatures(heightMapData, maskData, width, height);

            // Boulders
            const boulderGroup = svg.append("g").attr("class", "boulders");
            features.boulders.forEach(item => {
                const { x, y, rng } = item;
                const numPoints = 3 + Math.floor(rng.next() * 4);
                let dPath = "";
                for(let p=0; p<numPoints; p++) {
                    const angle = (p / numPoints) * 2 * Math.PI + (rng.next() - 0.5);
                    const rad = 10 + rng.next() * 3; 
                    const px = Math.cos(angle) * rad;
                    const py = Math.sin(angle) * rad;
                    dPath += (p===0 ? "M" : "L") + px + "," + py;
                }
                dPath += "z";
                
                const shade = 60 + rng.next() * 80;
                const isBrown = rng.next() > 0.8;
                const color = isBrown 
                    ? `rgb(${Math.floor(shade + 20)}, ${Math.floor(shade)}, ${Math.floor(shade - 20)})` 
                    : `rgb(${Math.floor(shade)}, ${Math.floor(shade)}, ${Math.floor(shade)})`;
                
                boulderGroup.append("path")
                    .attr("d", dPath)
                    .attr("transform", `translate(${x},${y})`)
                    .attr("fill", color)
                    .attr("class", "boulder");
            });

            // Trees
            const treeGroup = svg.append("g").attr("class", "trees");
            features.trees.forEach(item => {
                const { x, y, rng } = item;
                const scale = 0.8 + rng.next() * 0.5;
                treeGroup.append("path")
                    .attr("d", `M0,0 l-5,15 l10,0 z`) 
                    .attr("transform", `translate(${x},${y}) scale(${scale})`)
                    .attr("class", "tree");
            });
        },
        initGraph() {
            // Reset RNG for deterministic regeneration
            this.rng = new Mulberry32(this.seed);

            const width = window.innerWidth;
            const height = window.innerHeight;

            // For meandering paths
            const pathNoise = new SimplexNoise(() => this.rng.next());
            const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            const radialGenerator = d3.linkRadial()
                .angle(d => d.x)
                .radius(d => d.y);

            const generateMeanderingPath = (d) => {
                const pathString = radialGenerator(d);
                tempPath.setAttribute("d", pathString);
                
                const totalLen = tempPath.getTotalLength();
                if (totalLen === 0) return pathString;

                const points = [];
                const segments = Math.max(10, Math.floor(totalLen / 10));

                for (let i = 0; i <= segments; i++) {
                    const t = i / segments;
                    const pt = tempPath.getPointAtLength(t * totalLen);
                    
                    let dx = 0, dy = 0;
                    if (i > 0 && i < segments) {
                        let seed = 0;
                        if (d.id) {
                            for(let c=0; c<d.id.length; c++) seed = ((seed << 5) - seed) + d.id.charCodeAt(c);
                        }
                        seed = Math.abs(seed);
                        
                        const noiseX = pathNoise.noise2D(t * 5, seed * 0.1);
                        const noiseY = pathNoise.noise2D(t * 5 + 100, seed * 0.1);
                        
                        const amplitude = 3;
                        dx = noiseX * amplitude;
                        dy = noiseY * amplitude;
                    }
                    
                    points.push([pt.x + dx, pt.y + dy]);
                }
                
                return d3.line().curve(d3.curveBasis)(points);
            };

            const treeData = this.buildTreeData('start');
            const root = d3.hierarchy(treeData);

            // Radial layout
            const treeLayout = d3.tree()
                .size([2 * Math.PI, Math.min(width, height) * 2])
                .separation((a, b) => {
                    // James logic from layout perspective
                    if (a.data.name === LandscapeConfig.lakeNode || b.data.name === LandscapeConfig.lakeNode) {
                        return 3.5;
                    }
                    return (a.parent == b.parent ? 1 : 2) / a.depth;
                });

            treeLayout(root);

            // Rotate tree so 'james' is vertical
            const jamesNode = root.descendants().find(d => d.data.name === LandscapeConfig.lakeNode);
            if (jamesNode) {
                const currentAngle = jamesNode.x;
                const offset = 0 - currentAngle;
                root.descendants().forEach(d => {
                    d.x += offset;
                });
            }

            // Capture links
            const links = root.links();
            
            // Assign types
            links.forEach((d, i) => {
                d.id = `link-${i}`;
                const target = d.target.data;
                const hash = (str) => {
                    let h = 0;
                    for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
                    return h;
                };
                const pseudoRandom = Math.abs(hash(d.source.data.name + d.target.data.name)) % 100;

                if (target.type) {
                    d.styleType = 'run';
                    if (pseudoRandom > 66) d.runColor = 'run-black';
                    else if (pseudoRandom > 33) d.runColor = 'run-red';
                    else d.runColor = 'run-blue';
                } else {
                    if (pseudoRandom > 66) d.styleType = 'lift-chair';
                    else if (pseudoRandom > 33) d.styleType = 'lift-gondola';
                    else d.styleType = 'lift-drag';
                }
            });

            // Calculate Elevation
            root.each(d => {
                if (!d.parent) {
                    d.elevation = 0;
                } else {
                    const link = links.find(l => l.source === d.parent && l.target === d);
                    if (link) {
                        if (link.styleType === 'run') {
                            d.elevation = d.parent.elevation - 1.5;
                        } else {
                            d.elevation = d.parent.elevation + 0.8;
                        }
                    } else {
                         d.elevation = d.parent.elevation;
                    }
                }
            });

            const svg = d3.select("#background-graph")
                .html("")
                .append("svg")
                .attr("class", "responsive-svg")
                .attr("width", width)
                .attr("height", height)
                .attr("viewBox", [-width/2, -height/2, width, height]);
            
            const g = svg.append("g");
            this.g = g;

            // Draw Landscape Background
            this.drawLandscape(g, width, height, links, root);

            const linkGroup = g.append("g").attr("class", "links");

            // 1. RUNS
            linkGroup.selectAll(".run")
                .data(links.filter(d => d.styleType === 'run'))
                .join("path")
                .attr("class", d => `link run ${d.runColor}`)
                .attr("id", d => d.id)
                .attr("fill", "none")
                .attr("d", d => generateMeanderingPath(d));

            // 2. DRAG LIFTS
            linkGroup.selectAll(".lift-drag-group")
                .data(links.filter(d => d.styleType === 'lift-drag'))
                .call(g => {
                    const group = g.join("g").attr("class", "lift-drag-group");
                    
                    group.append("path")
                        .attr("class", "link lift-drag")
                        .attr("id", d => d.id)
                        .attr("fill", "none")
                        .attr("d", d => {
                             const s = polarToCartesian(d.source.x, d.source.y);
                             const t = polarToCartesian(d.target.x, d.target.y);
                             return `M${s.x},${s.y}L${t.x},${t.y}`;
                        });

                    group.each(function(d) {
                        const pathElement = d3.select(this).select("path").node();
                        try {
                            const len = pathElement.getTotalLength();
                            const spacing = 30;
                            const numMarkers = Math.floor(len / spacing);
                            
                            for(let i=1; i<=numMarkers; i++) {
                                const pt = pathElement.getPointAtLength(i * spacing);
                                d3.select(this).append("circle")
                                    .attr("cx", pt.x)
                                    .attr("cy", pt.y)
                                    .attr("r", 2.5)
                                    .attr("class", "drag-marker");
                            }
                        } catch(e) {
                             console.warn("Could not draw markers for lift-drag", e);
                        }
                    });
                });

            // Lift Drawing Helper
            const drawLiftGroup = (selection, typeClass, spacing, drawMarkerFn) => {
                const group = selection.join("g")
                    .attr("class", `${typeClass}-group`);
                
                group.append("path")
                    .attr("class", `link ${typeClass}`)
                    .attr("id", d => d.id)
                    .attr("fill", "none")
                    .attr("d", d => generateMeanderingPath(d));
                
                group.each(function(d) {
                    const pathElement = d3.select(this).select("path").node();
                    try {
                        const len = pathElement.getTotalLength();
                        const numMarkers = Math.floor(len / spacing);
                        
                        for(let i=1; i<=numMarkers; i++) {
                            const pt = pathElement.getPointAtLength(i * spacing);
                            drawMarkerFn(d3.select(this), pt);
                        }
                    } catch(e) {
                        console.warn(`Could not draw markers for ${typeClass}`, e);
                    }
                });
                return group;
            };

            // 3. CHAIR LIFTS
            linkGroup.selectAll(".lift-chair-group")
                .data(links.filter(d => d.styleType === 'lift-chair'))
                .call(g => drawLiftGroup(g, "lift-chair", 40, (container, pt) => {
                    container.append("rect")
                        .attr("x", pt.x - 3)
                        .attr("y", pt.y - 3)
                        .attr("width", 6)
                        .attr("height", 6)
                        .attr("class", "chair-marker");
                }));

            // 4. GONDOLA LIFTS
            linkGroup.selectAll(".lift-gondola-group")
                .data(links.filter(d => d.styleType === 'lift-gondola'))
                .call(g => drawLiftGroup(g, "lift-gondola", 60, (container, pt) => {
                    container.append("text")
                        .attr("x", pt.x)
                        .attr("y", pt.y)
                        .attr("class", "gondola-marker")
                        .attr("text-anchor", "middle")
                        .attr("dominant-baseline", "central")
                        .attr("font-size", "14px")
                        .html("&#x1F6A1");
                }));

            const allLinks = linkGroup.selectAll(".link");

            const node = g.append("g")
                .attr("class", "nodes")
                .selectAll("g")
                .data(root.descendants())
                .join("g")
                .attr("class", "node")
                .attr("transform", d => `
                    rotate(${d.x * 180 / Math.PI - 90})
                    translate(${d.y},0)
                `);

            node.append("circle")
                .attr("r", 5)
                .attr("class", d => d.data.type ? d.data.type : "");

            g.select(".trees").raise();

            this.addDebugLabels(g, links, node);

            this.svg = svg;
            this.root = root;
            this.link = allLinks;
            this.node = node.select("circle");
            
            this.updateHighlight();
        },
        addDebugLabels(g, links, node) {
            const linkLabels = g.append("g")
                .attr("class", "link-labels")
                .selectAll("text")
                .data(links)
                .join("text")
                .attr("dy", -3);

            linkLabels.append("textPath")
                .attr("href", d => `#${d.id}`)
                .attr("startOffset", "50%")
                .attr("class", "debug-label")
                .text(d => d.target.data.edgeLabel || "");

            node.append("title")
                .text(d => d.data.text);

            node.append("text")
                .attr("dy", "18") // Position below the node
                .attr("x", 0)
                // Counter-rotate the text so it's always horizontal
                .attr("transform", d => `rotate(${- (d.x * 180 / Math.PI - 90)})`)
                .text(d => d.data.name == LandscapeConfig.lakeNode ? "Lac du Faff" :  d.data.name)
                .attr("class", "debug-label-text");
        },
        updateHighlight() {
            if (!this.root || !this.link || !this.node) return;
            
            const questionToKey = new Map();
            Object.entries(questions).forEach(([key, value]) => {
                questionToKey.set(value, key);
            });

            const pathIds = this.currentPath.map(q => questionToKey.get(Vue.toRaw(q)));
            const activeNodeNames = new Set(pathIds);
            
            const currentId = pathIds[pathIds.length - 1];
            let activeNode = null;
            
            let currentNode = this.root;
            if (currentNode && currentNode.data.name === pathIds[0]) {
                for (let i = 1; i < pathIds.length; i++) {
                    if (!currentNode.children) break;
                    
                    const targetName = pathIds[i];
                    const edgeLabel = this.choices && this.choices[i-1];

                    const nextNode = currentNode.children.find(child => {
                        if (child.data.name !== targetName) return false;
                        if (edgeLabel && child.data.edgeLabel && child.data.edgeLabel !== edgeLabel) return false;
                        return true;
                    });

                    if (nextNode) {
                        currentNode = nextNode;
                    } else {
                        break;
                    }
                }
                activeNode = currentNode;
            }

            const pathNodes = activeNode ? activeNode.ancestors() : [];
            const pathNodeIds = new Set(pathNodes.map(d => d));
            
            this.node.classed("active", d => pathNodeIds.has(d));
            this.link.classed("active", d => pathNodeIds.has(d.target));
            
            if (activeNode && this.g) {
                const pos = polarToCartesian(activeNode.x, activeNode.y);
                
                this.g.transition()
                    .duration(750)
                    .attr("transform", `translate(${-pos.x},${-pos.y})`);
            }
        },
        handleResize() {
            if (window.innerWidth !== this.lastWidth) {
                this.lastWidth = window.innerWidth;
                const width = window.innerWidth;
                const height = window.innerHeight;
                if (this.svg) {
                    this.svg
                        .attr("width", width)
                        .attr("height", height)
                        .attr("viewBox", [-width/2, -height/2, width, height]);
                }
            }
        }
    },
    watch: {
        currentPath: {
            handler() {
                this.updateHighlight();
            },
            deep: true
        },
        choices: {
            handler() {
                this.updateHighlight();
            },
            deep: true
        }
    }
}
