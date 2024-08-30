import {
    vec3,
    mat4,
    utils,
} from "../lib/wgpu-matrix/2.x/wgpu-matrix.module.min.js";

"use strict";

const locations = {position:1, normal:3};

const id_group = 0;
const id_binding_matrices = 4;
const id_binding_light = 3;
const id_binding_material = 7;

//function toRadian(deg) { return deg*Math.PI / 180.0; }


async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if(!device) {
        throw Error("WebGPU not supported.");
    }
    const canvas = document.querySelector("#webgpu");
    const context = canvas.getContext("webgpu");
    const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: preferredFormat,
    });

//    const {buffer:vertexBuffer, layout:layoutVertexBuffer, count:countVertices}
//        = initVertexBuffer(device);

    const cube = initCube(device, locations);
    const plane = initPlane(device, locations);

    let layoutVertexBuffer = [
        {
            arrayStride: 4*3,
            attributes: [{
                format: "float32x3",
                offset: 0,
                shaderLocation: locations.position,
            }],
        },
        {
            arrayStride: 4*3,
            attributes: [{
                format: "float32x3",
                offset: 0,
                shaderLocation: locations.normal,
            }],
        }
    ];


    const {module:shaderModule, entry_vert, entry_frag} = initShaderModule(device);

    const pipeline = initPipeline(device, preferredFormat, shaderModule, entry_vert, entry_frag, layoutVertexBuffer);

    const szBufMatrices = 4*16*2; // 2 x mat4x4
    const szBufLight = 4*4*3; // 3 x vec4f (including paddings)
    const szBufMaterial = 4*4*2; // 2 x vec4f (including paddings)

    const uniformBuffer_matrices_cube = device.createBuffer({
        size: szBufMatrices,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const uniformBuffer_matrices_plane = device.createBuffer({
        size: szBufMatrices,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const uniformBuffer_light = device.createBuffer({
        size: szBufLight,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const uniformBuffer_material_cube = device.createBuffer({
        size: szBufMaterial,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const uniformBuffer_material_plane = device.createBuffer({
        size: szBufMaterial,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup_cube = device.createBindGroup({
        label:"bind group for the cube",
        layout: pipeline.getBindGroupLayout(id_group),
        entries:[
            { binding:id_binding_matrices, resource:{buffer:uniformBuffer_matrices_cube} },
            { binding:id_binding_light, resource:{buffer:uniformBuffer_light} },
            { binding:id_binding_material, resource:{buffer:uniformBuffer_material_cube} },
        ],
    });
    const bindGroup_plane = device.createBindGroup({
        label:"bind group for the plane",
        layout: pipeline.getBindGroupLayout(id_group),
        entries:[
            { binding:id_binding_matrices, resource:{buffer:uniformBuffer_matrices_plane} },
            { binding:id_binding_light, resource:{buffer:uniformBuffer_light} },
            { binding:id_binding_material, resource:{buffer:uniformBuffer_material_plane} },
        ],
    });


    const matrices = new Float32Array(szBufMatrices/4);
    const light = new Float32Array(szBufLight/4);
    const material = new Float32Array(szBufMaterial/4);

    light.set([4, 4, 1, 1], 0); // position
    light.set([.3, .3, .3], 4); // ambient
    light.set([1, 1, 1], 8);    // diffuse

    let P = mat4.perspective(utils.degToRad(50), 1, 1, 100);
    let V = mat4.rotation([1,0,0], utils.degToRad(10));
    V = mat4.rotate(V, [0,1,0], utils.degToRad(-40));
    V = mat4.translate(V, [-3, -1.5, -4]);

    let VP = mat4.multiply(P, V);

    let M_plane = mat4.scaling([5, 5, 5]);
    M_plane = mat4.rotate(M_plane, [1,0,0], utils.degToRad(-90));
    let MVP_plane = mat4.multiply(VP, M_plane);
    let N_plane = mat4.transpose(mat4.invert(mat4.multiply(V, M_plane)));

    let M_cube = mat4.translation([0, 0.5, 0]);
    let MVP_cube = mat4.multiply(VP, M_cube);
    let N_cube = mat4.transpose(mat4.invert(mat4.multiply(V, M_cube)));

    const renderPassDescriptor = {
       colorAttachments: [{
              // view: <- to be filled out when we render
                loadOp: "clear",
                clearValue: {r:0.5, g:0.5, b:0.5, a:1},
                storeOp: "store",
        }],
        depthStencilAttachment: {
              // view: <- to be filled out when we render
              depthClearValue: 1.0,
              depthLoadOp: 'clear',
              depthStoreOp: 'store',
        },
    };

    let depthTexture;

    function tick() {

        // While we don't need to upload the uniforms at every frame, we do it
        // for later use...
       device.queue.writeBuffer(
            uniformBuffer_light,
            0,
            light.buffer,
            light.byteOffset,
            light.byteLength
        );
       const canvasTexture = context.getCurrentTexture();
        renderPassDescriptor.colorAttachments[0].view = canvasTexture.createView();

        if(!depthTexture ||
            depthTexture.width !== canvasTexture.width ||
            depthTexture.height !== canvasTexture.height) {
            if (depthTexture) {
                depthTexture.destroy();
            }
            depthTexture = device.createTexture({
                size: [canvasTexture.width, canvasTexture.height],
                format: 'depth24plus',
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
        }
        renderPassDescriptor.depthStencilAttachment.view = depthTexture.createView();
        
        let encoder;
        let passRender;


        encoder = device.createCommandEncoder();


        passRender = encoder.beginRenderPass(renderPassDescriptor);
        passRender.setPipeline(pipeline);

        // render the plane
        matrices.set(MVP_plane, 0);
        matrices.set(N_plane, 16);
        device.queue.writeBuffer(uniformBuffer_matrices_plane, 0, matrices);

        material.set([.5, 1, 1], 0); // ambient
        material.set([.5, 1, 1], 4); // diffuse
        device.queue.writeBuffer(uniformBuffer_material_plane, 0, material);
 
        passRender.setVertexBuffer(0, plane.buffers.position);
        passRender.setVertexBuffer(1, plane.buffers.normal);
        passRender.setIndexBuffer(plane.buffers.index, 'uint32');
        passRender.setBindGroup(id_group, bindGroup_plane);
        passRender.drawIndexed(plane.count);

        // render the cube
        matrices.set(MVP_cube, 0);
        matrices.set(N_cube, 16);
        device.queue.writeBuffer(uniformBuffer_matrices_cube, 0, matrices);

        material.set([1, .5, .5], 0); // ambient
        material.set([1, .5, .5], 4); // diffuse
        device.queue.writeBuffer(uniformBuffer_material_cube, 0, material);

        passRender.setVertexBuffer(0, cube.buffers.position);
        passRender.setVertexBuffer(1, cube.buffers.normal);
        passRender.setIndexBuffer(cube.buffers.index, 'uint32');
        passRender.setBindGroup(id_group, bindGroup_cube);
        passRender.drawIndexed(cube.count);


        passRender.end();
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);

        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

function initShaderModule(device) {
    const source = `
        struct Matrices {
            MVP: mat4x4<f32>,
            N: mat4x4<f32>,
        };
        struct VSoutput {
            @builtin(position) position: vec4f,
            @location(0) normal: vec3f,
        };
        struct Light {
            position: vec4f,
            ambient: vec3f,
            diffuse: vec3f,
        };
        struct Material {
            ambient: vec3f,
            diffuse: vec3f,
        };
        @group(${id_group}) @binding(${id_binding_matrices}) var<uniform> matrices: Matrices;
        @group(${id_group}) @binding(${id_binding_light}) var<uniform> light: Light;
        @group(${id_group}) @binding(${id_binding_material}) var<uniform> material: Material;


        @vertex fn main_vert(@location(${locations.position}) position: vec4f,
                            @location(${locations.normal}) normal: vec3f)
            -> VSoutput {
            var vsOut: VSoutput;
            vsOut.position = matrices.MVP * position;
            vsOut.normal = (matrices.N * vec4f(normal, 0)).xyz;
            return vsOut;
        }

        @fragment fn main_frag(vsOut: VSoutput) -> @location(0) vec4f {
            var n = normalize(vsOut.normal);
            var l = normalize(light.position.xyz);

            var l_dot_n = max(dot(l,n), 0.0);
            var ambient = light.ambient * material.ambient;
            var diffuse = light.diffuse * material.diffuse * l_dot_n;

            return vec4f(ambient + diffuse, 1.0);
        }
    `;
    const shaderModule = device.createShaderModule({
        label: "simple scene shader",
        code:source,
    });
    return {module:shaderModule, entry_vert:"main_vert", entry_frag:"main_frag"};
}

function initPipeline(device, canvasFormat, shaderModule, entry_vert, entry_frag, layoutVertexBuffer) {
    const pipeline = device.createRenderPipeline({
        label: "simple scene pipeline",
        layout: "auto",
        vertex: {
            module:shaderModule,
            entryPoint: entry_vert,
            buffers: layoutVertexBuffer,
        },
        fragment: {
            module:shaderModule,
            entryPoint: entry_frag,
            targets: [{
                format: canvasFormat
            }]
        },
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus',
        },
    });
    return pipeline;
}


function initCube(device, locations) {
  // Create a cube
  //    v6----- v5
  //   /|      /|
  //  v1------v0|
  //  | |     | |
  //  | |v7---|-|v4
  //  |/      |/
  //  v2------v3

    const position = new Float32Array([   // Vertex coordinates
       .5, .5, .5,  -.5, .5, .5,  -.5,-.5, .5,   .5,-.5, .5,  // v0-v1-v2-v3 front
       .5, .5, .5,   .5,-.5, .5,   .5,-.5,-.5,   .5, .5,-.5,  // v0-v3-v4-v5 right
       .5, .5, .5,   .5, .5,-.5,  -.5, .5,-.5,  -.5, .5, .5,  // v0-v5-v6-v1 up
      -.5, .5, .5,  -.5, .5,-.5,  -.5,-.5,-.5,  -.5,-.5, .5,  // v1-v6-v7-v2 left
      -.5,-.5,-.5,   .5,-.5,-.5,   .5,-.5, .5,  -.5,-.5, .5,  // v7-v4-v3-v2 down
       .5,-.5,-.5,  -.5,-.5,-.5,  -.5, .5,-.5,   .5, .5,-.5   // v4-v7-v6-v5 back
    ]);
    
    const normal = new Float32Array([     // normals
         0, 0, 1,    0, 0, 1,    0, 0, 1,    0, 0, 1,
         1, 0, 0,    1, 0, 0,    1, 0, 0,    1, 0, 0,
         0, 1, 0,    0, 1, 0,    0, 1, 0,    0, 1, 0,
        -1, 0, 0,   -1, 0, 0,   -1, 0, 0,   -1, 0, 0,
         0,-1, 0,    0,-1, 0,    0,-1, 0,    0,-1, 0,
         0, 0,-1,    0, 0,-1,    0, 0,-1,    0, 0,-1
    ]);
    
    const index = new Uint32Array([       // Indices of the vertices
       0, 1, 2,   0, 2, 3,    // front
       4, 5, 6,   4, 6, 7,    // right
       8, 9,10,   8,10,11,    // up
      12,13,14,  12,14,15,    // left
      16,17,18,  16,18,19,    // down
      20,21,22,  20,22,23     // back
    ]);

    var buffers = {position:null, normal:null, indices: null};

    buffers.position = device.createBuffer({
        label:"cube vertices",
        size: position.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    buffers.normal = device.createBuffer({
        label:"cube nomals",
        size: normal.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    buffers.index = device.createBuffer({
        label:"cube indices",
        size: index.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(buffers.position, 0, position);
    device.queue.writeBuffer(buffers.normal, 0, normal);
    device.queue.writeBuffer(buffers.index, 0, index);

    return {buffers:buffers, count:index.length};
}

function initPlane(device, locations) {

    const position = new Float32Array([   // Vertex coordinates
       .5, .5, 0,   -.5, .5, 0,  -.5, -.5, 0,  .5, -.5, 0  // v0-v5-v6-v1 up
    ]);
    
    const normal = new Float32Array([     // Normals
        0, 0, 1,    0, 0, 1,    0, 0, 1,    0, 0, 1
    ]);
    
    const index = new Uint32Array([       // Indices of the vertices
       0, 1, 2,   0, 2, 3,    // front
    ]);

    var buffers = {vertices:null, normals:null, indices: null};

    buffers.position = device.createBuffer({
        label:"plane vertices",
        size: position.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    buffers.normal = device.createBuffer({
        label:"plane nomals",
        size: normal.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    buffers.index = device.createBuffer({
        label:"plane indices",
        size: index.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(buffers.position, 0, position);
    device.queue.writeBuffer(buffers.normal, 0, normal);
    device.queue.writeBuffer(buffers.index, 0, index);

    return {buffers:buffers, count:index.length};
}



main();

