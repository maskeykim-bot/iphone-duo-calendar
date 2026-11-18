// シェーダー（curl-webgl-r3.js の VS・COMMON・FS_BASE・FS_PAPER。式は変えない）。
// 変えたのは溝の固定値だけ：FS_BASE の 458./484. と FS_PAPER の溝の濃さ（460/468/482/490）を uniform uGx（溝の左端・右端）から出す。
// 第18.3版：左右のページの幅の違い（左 457.5・右 365.5）と溝 20pt。紙は右ページの幅の網目で巻き、背より左に来た所だけ横に寄せる（uMw＝寄せる量 0〜1）。
//  x' = 背 − 溝×w − (背 − x)×(1 + w×(左幅/右幅 − 1))。w＝1 で x120〜485.5 → x8〜465.5（左ページそのもの）。前へは w をめくりの進み具合 0→1、戻りは常に 1。
//  背をまたぐ三角形（溝の上で引き伸ばされる所）は描かない。裏・表の絵は w＝1 の写し方で、左ページ全体（日付・時刻の列まで）を実寸で貼る。
export const VS = `attribute vec2 aX;uniform vec2 uP,uN,uView,uC;uniform float uR,uPersp,uSp,uMw,uMs,uMg;
varying vec2 vX,vQ;varying float vD,vS;
void main(){float d=dot(aX-uP,uN);vec2 q=aX;float z=0.;float pr=3.14159265*uR;
 if(d>0.){if(d<pr&&uR>0.001){float th=d/uR;q=aX+(uR*sin(th)-d)*uN;z=uR*(1.-cos(th));}else{q=aX+(-(d-pr)-d)*uN;z=2.*uR+0.6;}}
 vX=aX;vD=d;vQ=q;if(q.x<uSp)q.x=uSp-uMg*uMw-(uSp-q.x)*(1.+uMw*(uMs-1.));vS=q.x;vec2 s=uPersp>0.?uC+(q-uC)*(uPersp/(uPersp-z)):q;
 gl_Position=vec4(s.x/uView.x*2.-1.,1.-s.y/uView.y*2.,-(z+(d>0.?0.3:0.))/400.,1.);}`;
export const COMMON = `precision highp float;
uniform vec2 uP,uN;uniform float uR,uLift,uDark;uniform vec4 uRect;uniform vec2 uGx;uniform float uSp,uMw,uMs,uMg;
// 寄せた画面の x → 寄せる前（網目の座標）。影は寄せる前の紙で計算する
float unmapX(float x){if(x>=uSp)return x;float b=uSp-uMg*uMw;return x>=b?uSp:uSp-(b-x)/(1.+uMw*(uMs-1.));}
// 網目の座標 → 左右のページの実際の x（w＝1 の写し方。絵を貼るとき）
float realX(float x){return x<uSp?uSp-uMg-(uSp-x)*uMs:x;}
uniform float kShOp0,kShOpK,kShBl0,kShBlK,kShOff0,kShOffK,kSgn,kShadowMul;
float sdRect(vec2 X,vec4 r){vec2 c=(r.xy+r.zw)*.5,h=(r.zw-r.xy)*.5;vec2 q=abs(X-c)-h;return length(max(q,0.))+min(max(q.x,q.y),0.);}
float soft(vec2 X,float b){return 1.-smoothstep(-b,b,sdRect(X,uRect));}
// 持ち上がった紙（巻き＋平らな裏）を真上から見たときの、ぼかした覆い具合
float cover(vec2 Q,float b){float dq=dot(Q-uP,uN);float pr=3.14159265*uR;float c=0.;
 if(uR>0.001){float a=asin(clamp(dq/uR,0.,1.));float d1=uR*a,d2=pr-uR*a;
  float e=smoothstep(uR+b,uR-b,dq)*smoothstep(-b,b,dq);
  float h1=clamp((1.-cos(a))*1.2,0.,1.);
  c=max(c,e*max(soft(Q+(d1-dq)*uN,b)*h1,soft(Q+(d2-dq)*uN,b)));}
 float d3=pr-dq;c=max(c,smoothstep(b,-b,dq)*soft(Q+(d3-dq)*uN,b));return c;}
float dropShadow(vec2 Q){float L=uLift;float bl=kShBl0+kShBlK*L,op=kShOp0-kShOpK*L,o=kShOff0+kShOffK*L;
 vec2 off=vec2(0.3*o*kSgn,0.6*o);return op*cover(Q-off,bl)*kShadowMul;}`;
export const FS_BASE = COMMON + `uniform sampler2D tLo,tLn,tRo,tRn;uniform vec4 rL,rR;uniform vec3 bg,groove;uniform float uStripX,uStripMix,uLnew,uRnew,uPaperA;varying vec2 vX;
void main(){vec2 Q=vX;vec3 c=bg;
 if(Q.x>=rL.x&&Q.x<=rL.z&&Q.y>=rL.y&&Q.y<=rL.w){vec2 uv=(Q-rL.xy)/(rL.zw-rL.xy);vec3 o=texture2D(tLo,uv).rgb,n=texture2D(tLn,uv).rgb;c=mix(o,n,Q.x<uStripX?uStripMix:uLnew);}
 else if(Q.x>=rR.x&&Q.x<=rR.z&&Q.y>=rR.y&&Q.y<=rR.w){vec2 uv=(Q-rR.xy)/(rR.zw-rR.xy);c=mix(texture2D(tRo,uv).rgb,texture2D(tRn,uv).rgb,uRnew);}
 else if(Q.x>uGx.x&&Q.x<uGx.y)c=groove;
 c*=1.-dropShadow(vec2(unmapX(Q.x),Q.y));gl_FragColor=vec4(c,1.);}`;
export const FS_PAPER = COMMON + `uniform sampler2D tF,tN;uniform float kAmpR0,kAmpR1,kDkFm,kHiMinW,kHiDark,kHiMask,kShow,kBackLine,kNext,kHiF,kHiFd,kHiFw,kDkF0,kDkF1,kDkFa,kDkFb,kDkB,kHiB,kHiBd,kHiBw,kFlatB,kFlatBw,kRootA0,kRootAK,kRootIn,kRootOut0,kRootOutK,kGroove;
uniform vec3 backPaper,lineCol,edgeCol,frontPaper;uniform float uDebug,uPaperA,uSpine;uniform vec4 uFrontRect,uBackRect;varying vec2 vX,vQ;varying float vD,vS;
const float PI=3.14159265;float g(float x,float c,float w){float t=(x-c)/w;return exp(-t*t);}
// 巻きが細い（半径が小さい）うちは、巻きの明暗を弱める。細い筒に 4 つの筋が 6pt に詰まって段に見えるため（第3報）
float ampR(){return smoothstep(kAmpR0,kAmpR1,uR);}
float herm(float p0,float p1,float m0,float m1,float u){float u2=u*u,u3=u2*u;return (2.*u3-3.*u2+1.)*p0+(u3-2.*u2+u)*m0+(-2.*u3+3.*u2)*p1+(u3-u2)*m1;}
// 巻きの表の暗い筋：23°→43° で 0→6%、43°→89° で 6%→36%。43° で傾きをつなぐ（前は 43° で傾きが 0 になり、細い段に見えた。第3報）
float dkF(float deg){float a0=kDkFa-20.,m=kDkFm;
 if(deg<=a0)return 0.;if(deg<kDkFa){float L=kDkFa-a0;return herm(0.,kDkF0,0.,m*L,(deg-a0)/L);}
 if(deg<kDkFb){float L=kDkFb-kDkFa;return herm(kDkF0,kDkF1,m*L,0.,(deg-kDkFa)/L);}return kDkF1;}
void main(){if(uMw>0.&&vS>uSp-uMg*uMw+.05&&vS<uSp-.05)discard; // 背をまたいで溝の上に引き伸ばされた所
 vec2 uv=(vX-uRect.xy)/(uRect.zw-uRect.xy);vec2 fuv=(vec2(realX(vX.x),vX.y)-uFrontRect.xy)/(uFrontRect.zw-uFrontRect.xy);vec3 F=(fuv.x>=0.&&fuv.x<=1.)?texture2D(tF,fuv).rgb:frontPaper;float d=vD;float pr=PI*uR;
 float dark=0.,hi=0.;bool back=false;
 float root=(kRootA0+kRootAK*uLift);
 if(d<=0.){ // 平らな表：根元の内側にごく短いグラデーション（上に紙がある所だけ＝一定幅の帯にしない）
   float w=kRootIn;float t=1.-smoothstep(-w,0.,d);
   dark=root*(1.-t); dark=1.-(1.-dark)*(1.-dropShadow(vQ)); /* 第3報：(1-t)² をやめ smoothstep 1 回に（立ち上がりの曲がりを小さく） */ // 根元 0→12%（巻きはじめ 12% へ段なしでつなぐ。上に紙があるかで弱めない）。第2報はこの行の注記で影が消えていた
 } else if(d<pr&&uR>0.001){float th=d/uR;float deg=th*180./PI;
   if(th<PI*.5){ // 巻きの表
     float w=kRootOut0+kRootOutK*uLift;dark=root*(1.-smoothstep(0.,w,d));
     dark=max(dark,dkF(deg)*ampR());
     {float sc=uR*sin(kHiFd*PI/180.),sw=max(uR*abs(cos(kHiFd*PI/180.))*kHiFw*PI/180.,kHiMinW);hi=kHiF*g(uR*sin(th),sc,sw)*ampR();}dark=1.-(1.-dark)*(1.-dropShadow(vQ)*(1.-smoothstep(0.,kRootOut0+kRootOutK*uLift,d))); // 落ちる影も根元と同じ幅でなめらかに消す（第3報。前は cosθ で、根元と別の速さで消えて段になった）
   } else { back=true;float s=(th-PI*.5)/(PI*.5); // 巻きの裏：てっぺん側が暗く、160°に細い光
     dark=mix(kDkB*ampR(),kFlatB,smoothstep(0.,1.,s));// 光の筋は画面の上での幅で決める。半径が小さいと 160°±6° が 1pt ほどの線になり、段に見えるため（第3報）
     float sc=uR*sin(kHiBd*PI/180.),sw=max(uR*abs(cos(kHiBd*PI/180.))*kHiBw*PI/180.,kHiMinW);hi=kHiB*g(uR*sin(th),sc,sw)*smoothstep(90.,110.,deg)*ampR();}
 } else {back=true;dark=kFlatB*(1.-smoothstep(0.,kFlatBw,d-pr));}
 vec3 c;
 if(back){float ly=mod(vX.y-uRect.y,30.);float ln=clamp(1.-abs(ly-29.5),0.,1.)*kBackLine;
   c=mix(backPaper,lineCol,ln);
   if(kNext>0.){vec2 bq=vec2(realX(2.*uSpine-vX.x),vX.y),bu=(bq-uBackRect.xy)/(uBackRect.zw-uBackRect.xy);vec3 N=(bu.x>=0.&&bu.x<=1.)?texture2D(tN,bu).rgb:backPaper;c=mix(c,N,kNext);} // 第18.2版：裏＝着地した所に置かれる次のページ（背で折り返した位置の絵）
   c=mix(c,F,kShow*(1.-kNext)); // 表の内容が左右反対に透ける（同じ紙の点の表の色を混ぜる）
   float e=smoothstep(-1.4,-0.2,sdRect(vX,uRect));c=mix(c,edgeCol,e*0.8);
 } else c=F;
 float gx=vQ.x;float gr=smoothstep(uGx.x+2.,uGx.x+10.,gx)*(1.-smoothstep(uGx.y-2.,uGx.y+6.,gx));dark=1.-(1.-dark)*(1.-kGroove*gr);
 // 光は紙色にだけ足す。文字まで白と混ぜてコントラストを落とさない（CS-18）
 vec3 pc=back?backPaper:frontPaper;float paperMask=mix(1.,1.-smoothstep(.05,.18,length(c-pc)),kHiMask); // 紙色に近い所だけ
 float hiAmt=hi*(uDark>.5?kHiDark:1.);c=c*(1.-dark)+hiAmt*(1.-c)*paperMask;gl_FragColor=vec4(c,uPaperA);if(uDebug>.5)gl_FragColor=vec4(back?0.:1.,back?1.:0.,0.,1.);}`;
