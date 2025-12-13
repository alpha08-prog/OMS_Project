 export type GovernmentHeroProps = {
  imageUrl: string
  name: string
  currentRole: string
  pastRoles: string[]
  constituency: string
}

export default function GovernmentHeroSection({ imageUrl, name, currentRole, pastRoles, constituency }: GovernmentHeroProps) {
  return (
    <section className="relative h-full w-full overflow-hidden">
      <img
        src={imageUrl}
        alt="Official portrait"
        className="absolute inset-0 h-full w-full object-cover transform scale-[1.06] md:scale-[1.1]"
        loading="eager"
      />
      {/* Softer horizontal gradient so text avoids the face and the portrait remains clear */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-900/30 via-blue-900/15 to-transparent" aria-hidden="true" />

      {/* Place content bottom-left to avoid covering the portrait's face */}
      <div className="relative z-10 h-full flex items-end justify-start p-5 sm:p-8">
        <div className="max-w-xl text-left text-white drop-shadow-md">
          <div className="flex items-start gap-3">
            <span className="mt-1 h-12 sm:h-16 w-1.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 shadow-[0_0_12px_rgba(255,153,51,0.35)]" aria-hidden="true" />
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">{name}</h1>
              <p className="mt-2 text-amber-300 font-semibold text-sm sm:text-base">
                {currentRole}
              </p>
              <div className="mt-2 space-y-1 text-xs sm:text-sm text-blue-100">
                {pastRoles.map((role, idx) => (
                  <p key={idx}>{role}</p>
                ))}
              </div>
              <p className="mt-2 text-blue-100/90 text-xs sm:text-sm">
                {constituency}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
