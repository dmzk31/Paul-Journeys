const params=new URLSearchParams(location.search);let saved;try{saved=localStorage.getItem('paul-theme')}catch{}
const choice=params.get('theme')||saved||'atlas';
export const theme=['atlas','journal','night'].includes(choice)?choice:'atlas';
document.documentElement.dataset.theme=theme;try{if(!params.has('preview'))localStorage.setItem('paul-theme',theme)}catch{}
export const themeMapColors={"atlas": {"sea": "#c9e3ee", "land": "#e5e9df", "margin": "#eef3f2", "regions": {"#e8d5c6": "#e8d5c6", "#d8d4e3": "#d8d4e3", "#c7ddce": "#c7ddce", "#ece3be": "#ece3be", "#d3dce0": "#d3dce0"}}, "journal": {"sea": "#c4d6ce", "land": "#e9dfc7", "margin": "#f4ecd9", "regions": {"#e8d5c6": "#ddc1a5", "#d8d4e3": "#d6c4b4", "#c7ddce": "#c6caa3", "#ece3be": "#e4cf9e", "#d3dce0": "#cfccc0"}}, "night": {"sea": "#152d43", "land": "#253e4c", "margin": "#0d1d2c", "regions": {"#e8d5c6": "#566058", "#d8d4e3": "#484e68", "#c7ddce": "#365b59", "#ece3be": "#625f44", "#d3dce0": "#3f5569"}}};
