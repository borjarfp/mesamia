/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    // "/" no es una página propia: Planificador y Guardados viven en sus propias rutas.
    return [{ source: '/', destination: '/planificador', permanent: false }]
  },
}

export default nextConfig
