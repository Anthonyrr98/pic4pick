export default defineAppConfig({
  pages: ['pages/gallery/index'],
  subPackages: [{ root: 'admin', pages: ['pages/index'] }],
  window: { navigationBarTitleText: 'Light of Anthony', navigationBarBackgroundColor: '#f5f5f2', navigationBarTextStyle: 'black', backgroundColor: '#f5f5f2' },
  permission: { 'scope.userLocation': { desc: '用于附近、远方作品排序及地图发现' } },
  requiredPrivateInfos: ['getLocation', 'chooseLocation'],
  lazyCodeLoading: 'requiredComponents',
})
