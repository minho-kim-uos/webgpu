import * as THREE from 'three';

function main()
{
    const canvas = document.getElementById('webgl');
    const renderer = new THREE.WebGLRenderer( { antialias: true, canvas } );
    
    

    document.getElementById("mag-LINEAR").value = THREE.LinearFilter;
    document.getElementById("mag-NEAREST").value = THREE.NearestFilter;

    document.getElementById("min-LINEAR").value = THREE.LinearFilter;
    document.getElementById("min-NEAREST").value = THREE.NearestFilter;
    document.getElementById("min-NEAREST_MIPMAP_NEAREST").value = THREE.NearestMipmapNearestFilter;
    document.getElementById("min-LINEAR_MIPMAP_NEAREST").value =  THREE.LinearMipmapNearestFilter;
    document.getElementById("min-NEAREST_MIPMAP_LINEAR").value = THREE.NearestMipmapLinearFilter;
    document.getElementById("min-LINEAR_MIPMAP_LINEAR").value = THREE.LinearMipmapLinearFilter;
    
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 100);
    camera.position.set(0, -10, 1);
    camera.lookAt(0, 0, 0);
    camera.up.set(0, 1, 0);

    const textures = 
    {
        "checkerboard":generate_tex_checkerboard(32),
//        "separate_colors":generate_tex_mipmap(gl, 6, [[255,0,0], [0,255,0], [0,0,255], [255,255,0], [255,0,255], [0,255,255]])
    };


    function on_change_filter(event) {
        const tex = textures["checkerboard"];
        tex.minFilter = document.querySelector("#min-filter").value;
        tex.magFilter = document.querySelector("#mag-filter").value;
        tex.needsUpdate = true;
    }

    document.querySelector("#min-filter").addEventListener("change", on_change_filter);
    document.querySelector("#mag-filter").addEventListener("change", on_change_filter);

    const scene = new THREE.Scene();

    {
        const vertices = new Float32Array([-.5,-.5, 0, 
                                            .5,-.5, 0,
                                            .5, .5, 0,
                                           -.5, .5, 0]);
        const texcoords = new Float32Array([ 0, 0, 20, 0, 20, 20, 0, 20]);
        const indices = [0, 1, 2, 2, 3, 0];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(texcoords, 2));
        geometry.setIndex(indices);


        const material = new THREE.MeshBasicMaterial({map:textures["checkerboard"]});
        const geom_Threejs = new THREE.PlaneGeometry(1,1);
        const plane = new THREE.Mesh(geometry, material);
        plane.scale.set(20,20,20);
        scene.add(plane);
    }
    
    const X_MIN = -2;
    const X_MAX = 2;
    const X_STEP = 1.5;
    
    let t_last = Date.now();
    let sign = 1;
    let x = 0;

    function tick()
    {
        let now = Date.now();
        let elapsed = now - t_last;
        t_last = now;
        
        x += sign * (document.getElementById("speed").value*0.01) * elapsed * 0.001;
        if(x > X_MAX)
        {
            x = X_MAX;
            sign *= -1;
        }
        else if(x < X_MIN)
        {
            x = X_MIN;
            sign *= -1;
        }
        camera.position.x = x;
        
        renderer.render(scene, camera);
        requestAnimationFrame(tick, canvas); // Request that the browser calls tick
    };
    
    tick();
    
}

function generate_tex_checkerboard(N)
{
    const img = new Uint8Array(N*N*4);
    let color;
    for(let i=0 ; i<N ; i++)
    {
        for(let j=0 ; j<N ; j++)
        {
            
            if(((i < (N/2))+(j < (N/2)))%2 == 0)    color = 255;
            else                                    color = 0;
            img[4*(N*i + j) + 0] = color;
            img[4*(N*i + j) + 1] = color;
            img[4*(N*i + j) + 2] = color;
            img[4*(N*i + j) + 3] = 255;
        }
    }
    const texture = new THREE.DataTexture(img, N, N);
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    
    return texture;
}

function generate_tex_mipmap(gl, levels, colors, max_level)
{
    const tex = gl.createTexture(); 
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for(let level = 0 ; level < levels ; level++)
    {
        let N = Math.pow(2,levels-level-1);
        let img = new Uint8Array(N*N*3);
        for(let i=0 ; i<N ; i++)
        {
            for(let j=0 ; j<N ; j++)
            {
                for(let k=0 ; k<3 ; k++) img[3*(i*N + j) + k] = colors[level][k];
            }
        }
        gl.texImage2D(gl.TEXTURE_2D, level, gl.RGB, N, N, 0, gl.RGB, gl.UNSIGNED_BYTE, img);
    }
    return tex;
}

main();

