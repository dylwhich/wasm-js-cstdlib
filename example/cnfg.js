/*
 *
 * Adapted from https://github.com/cntools/rawdraw
 * Thanks to @zNoctum and @redline2466.
 *
 */

import { getArrFloat, getArrUint8, getStr, getPtr, endian } from "../js/util/pointers.js";
import { asyncSuspend, asyncResume } from "../js/util/asyncify.js";

let fullscreen = false;
let useLoopFunction = false;

let canvas;
let wgl;

let wglShader = null; //Standard flat color shader
let wglABV = null;    //Array buffer for vertices
let wglABC = null;    //Array buffer for colors.
let wglUXFRM = null;  //Uniform location for transform on solid colors

//Utility stuff for WebGL sahder creation.
function wgl_makeShader( vertText, fragText )
{
	let vert = wgl.createShader(wgl.VERTEX_SHADER);
	wgl.shaderSource(vert, vertText );
	wgl.compileShader(vert);
	if (!wgl.getShaderParameter(vert, wgl.COMPILE_STATUS)) {
			alert(wgl.getShaderInfoLog(vert));
	}

	let frag = wgl.createShader(wgl.FRAGMENT_SHADER);
	wgl.shaderSource(frag, fragText );
	wgl.compileShader(frag);
	if (!wgl.getShaderParameter(frag, wgl.COMPILE_STATUS)) {
			alert(wgl.getShaderInfoLog(frag));
	}
	let ret = wgl.createProgram();
	wgl.attachShader(ret, frag);
	wgl.attachShader(ret, vert);
	wgl.linkProgram(ret);
	wgl.bindAttribLocation( ret, 0, "a0" );
	wgl.bindAttribLocation( ret, 1, "a1" );
	return ret;
}

function initWglShaders()
{
	//We load two shaders, one is a solid-color shader, for most rawdraw objects.
	wglShader = wgl_makeShader(
		"uniform vec4 xfrm; attribute vec3 a0; attribute vec4 a1; varying vec4 vc; void main() { gl_Position = vec4( a0.xy*xfrm.xy+xfrm.zw, a0.z, 0.5 ); vc = a1; }",
		"precision mediump float; varying vec4 vc; void main() { gl_FragColor = vec4(vc.xyzw); }" );

	wglUXFRM = wgl.getUniformLocation(wglShader, "xfrm" );

	//Compile the shaders.
	wgl.useProgram(wglShader);

	//Get some vertex/color buffers, to put geometry in.
	wglABV = wgl.createBuffer();
	wglABC = wgl.createBuffer();

	//We're using two buffers, so just enable them, now.
	wgl.enableVertexAttribArray(0);
	wgl.enableVertexAttribArray(1);

	//Enable alpha blending
	wgl.enable(wgl.BLEND);
	wgl.blendFunc(wgl.SRC_ALPHA, wgl.ONE_MINUS_SRC_ALPHA);
}

//Do webgl work that must happen every frame.
function FrameStart()
{
	//Fixup canvas sizes
	if( fullscreen )
	{
		wgl.viewportWidth = canvas.width = window.innerWidth;
		wgl.viewportHeight = canvas.height = window.innerHeight;
	}

	//Make sure viewport and input to shader is correct.
	//We do this so we can pass literal coordinates into the shader.
	wgl.viewport( 0, 0, wgl.viewportWidth, wgl.viewportHeight );

	//Update geometry transform (Scale/shift)
	wgl.uniform4f( wglUXFRM,
		1./wgl.viewportWidth, -1./wgl.viewportHeight,
		-0.5, 0.5);
}

function SystemStart( title, w, h )
{
	document.title = getStr( title );
	wgl.viewportWidth = canvas.width = w;
	wgl.viewportHeight = canvas.height = h;
}

//Buffered geometry system.
//This handles buffering a bunch of lines/segments, and using them all at once.
let globalv = null;

// Non-exported JS implementation
function CNFGEmitBackendTrianglesJS( vertsF, colorsI, vertcount )
{
	const ab = wgl.ARRAY_BUFFER;
	wgl.bindBuffer(ab, wglABV);
	wgl.bufferData(ab, vertsF, wgl.DYNAMIC_DRAW);
	wgl.vertexAttribPointer(0, 3, wgl.FLOAT, false, 0, 0);
	wgl.bindBuffer(ab, wglABC);
	wgl.bufferData(ab, colorsI, wgl.DYNAMIC_DRAW);
	wgl.vertexAttribPointer(1, 4, wgl.UNSIGNED_BYTE, true, 0, 0);
	wgl.drawArrays(wgl.TRIANGLES, 0, vertcount );
	globalv = vertsF;
}

function setupMainLoop() {
    if (useLoopFunction) {
        function floop() {
            FrameStart();
            requestAnimationFrame(floop);
            // The code is now ready to rewind; to start the process, enter the
            // first function that should be on the call stack.
            wasmExports.loop();
        }
        floop();
    } else {

    }
}

function setupEventHandlers(instance) {
    //Attach inputs
    if(instance.exports.HandleMotion) {
        canvas.addEventListener('mousemove', e => { instance.exports.HandleMotion( e.offsetX, e.offsetY, e.buttons ); } );
        canvas.addEventListener('touchmove', e => { instance.exports.HandleMotion( e.touches[0].clientX, e.touches[0].clientY, 1 ); } );
    }

    if( instance.exports.HandleButton ) {
        canvas.addEventListener('mouseup', e => { instance.exports.HandleButton( e.offsetX, e.offsetY, e.button, 0 ); return false; } );
        canvas.addEventListener('mousedown', e => { instance.exports.HandleButton( e.offsetX, e.offsetY, e.button, 1 ); return false; } );
    }

    if( instance.exports.HandleKey ) {
        // TODO: Make this use the new cool non-deprecated key stuff
        document.addEventListener('keydown', e => { instance.exports.HandleKey( e.keyCode, 1 ); } );
        document.addEventListener('keyup', e => { instance.exports.HandleKey( e.keyCode, 0 ); } );
    }
}

///////////////////////////////////
// Begin WASM-exported Functions //
///////////////////////////////////

export function CNFGEmitBackendTriangles(vertsF, colorsI, vertcount ) {
    //Take a float* and uint32_t* of vertices, and flat-render them.
    CNFGEmitBackendTrianglesJS(
        getArrFloat(vertsF, vertCount*3).slice(),
        getArrUint8(colorsI, vertcount*4).slice(),
        vertcount );
}

export function CNFGSetup(title,w,h ) {
    SystemStart( title, w, h );
    fullscreen = false;
}

export function CNFGSetupFullscreen(title,w,h ) {
    SystemStart( title, w, h );
    canvas.style = "position:absolute; top:0; left:0;"
    fullscreen = true;
}

export function CNFGClearFrameInternal(color) {
    wgl.clearColor( (color&0xff)/255., ((color>>8)&0xff)/255.,
        ((color>>16)&0xff)/255., ((color>>24)&0xff)/255. );
    wgl.clear( wgl.COLOR_BUFFER_BIT | wgl.COLOR_DEPTH_BIT );
}

export function CNFGGetDimensions(pw, ph) {
    getPtr(pw).setInt16(0, canvas.width, endian);
    getPtr(ph).setInt16(0, canvas.height, endian);
}

export function OGGetAbsoluteTime() {
    return new Date().getTime()/1000.;
}

export function CNFGSwapBuffersInternal() {
    if (asyncSuspend()) {
        requestAnimationFrame(() => {
            FrameStart();
            asyncResume();
        });
    }
}

export function postInstantiate(instance) {
    setupEventHandlers(instance);
}

export default function configure(imports, settings) {
    if (settings.canvas) {
        canvas = settings.canvas;
    } else {
        canvas = document.getElementById("canvas");
    }

    useLoopFunction = (settings && settings.rawdraw && settings.rawdraw.useLoopFunction);

    wgl = canvas.getContext("webgl");

    imports.CNFGEmitBackendTriangles = CNFGEmitBackendTriangles;
    imports.CNFGSetup = CNFGSetup;
    imports.CNFGSetupFullscreen = CNFGSetupFullscreen;
    imports.CNFGClearFrameInternal = CNFGClearFrameInternal;
    imports.CNFGGetDimensions = CNFGGetDimensions;
    imports.OGGetAbsoluteTime = OGGetAbsoluteTime;

    imports.bynsyncify.CNFGSwapBuffersInternal = CNFGSwapBuffersInternal;

    initWglShaders();
}
