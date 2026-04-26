import { Linkedin, ArrowLeft, User, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import mentorImage from '../assets/image.png';
import leaderImage from '../assets/leader.png';
import frontend_devImage from '../assets/frontend_dev.png';
import app_devImage from '../assets/om.jpeg';


const teamMembers = [
  {
    name: 'Dr. Manjunath K. Vanhalli',
    role: 'Mentor & Guide',
    description: 'Academic mentor and strategic advisor. Provides guidance, domain expertise, and oversees the project direction.',
    linkedin: 'https://www.linkedin.com/in/manjunath-vanahalli-4b24ab69/',
    bgColor: 'bg-blue-100',
    iconColor: 'text-blue-600',
    image: mentorImage
  },
  {
    name: 'Shree Vats',
    role: 'Team Leader, Backend Developer',
    description: 'Leads development and manages the project. Responsible for architecture, coordination, and core web development.',
    linkedin: 'https://www.linkedin.com/in/shree-vats/',
    bgColor: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    image: leaderImage
  },
  {
    name: 'Atharva Agrawal',
    role: 'Frontend Developer',
    description: 'Works on UI/UX and server-side logic, creating seamless and responsive user experiences.',
    linkedin: 'https://www.linkedin.com/in/atharva-agrawal-172421330/',
    bgColor: 'bg-amber-100',
    iconColor: 'text-amber-600',
    image: frontend_devImage
  },
  
  {
    name: 'Om Pandey',
    role: 'Mobile/App Developer',
    description: 'Builds and maintains the application, ensures performance and usability across devices.',
    linkedin: 'https://www.linkedin.com/in/om-pandey-025223279/',
    bgColor: 'bg-teal-100',
    iconColor: 'text-teal-600',
    image: app_devImage
  }
  
];

export default function AboutUs() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation Bar */}
      <nav className="fixed top-0 w-full bg-slate-50/80 backdrop-blur-xl z-50 border-b border-slate-200/50 transition-all duration-300 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-extrabold tracking-tight text-slate-900 border-l border-slate-300 pl-3">OMS</span>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="group flex items-center gap-2 text-sm font-semibold text-slate-600 bg-white shadow-sm ring-1 ring-slate-200/60 hover:ring-indigo-300 hover:text-indigo-600 transition-all px-5 py-2.5 rounded-full hover:shadow-md hover:-translate-y-0.5"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Go Back
          </button>
        </div>
      </nav>

      <main className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative mt-2">
        {/* Subtle background glow for the top section */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[300px] bg-blue-300/15 rounded-full blur-[100px] pointer-events-none" />

        {/* Hero Section */}
        <section className="text-center max-w-3xl mx-auto mb-10 space-y-3 relative z-10 pt-4">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 drop-shadow-sm">
            Meet Our <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Team</span>
          </h1>
          <p className="text-sm md:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto mb-2">
            A passionate group of developers and mentors dedicated to building innovative, collaborative, and seamless solutions.
          </p>
        </section>

        {/* Team Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
          {teamMembers.map((member, idx) => (
            <div
              key={idx}
              className="group flex flex-col relative bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-sm ring-1 ring-slate-200/60 hover:shadow-xl hover:-translate-y-1.5 hover:ring-indigo-100 transition-all duration-300 ease-out overflow-hidden"
            >
              {/* Decorative top border glow hover effect */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className="flex flex-col items-center text-center space-y-4 flex-1">
                {/* Avatar / Image */}
                <div className={`w-24 h-24 rounded-full ${member.bgColor} flex items-center justify-center ring-4 ring-white shadow-md mb-2 group-hover:scale-105 group-hover:shadow-lg transition-all duration-300 overflow-hidden`}>
                  {member.image ? (
                    <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className={`w-10 h-10 ${member.iconColor}`} />
                  )}
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                    {member.name}
                  </h3>
                  <p className="text-sm font-semibold text-indigo-600 tracking-wide uppercase">
                    {member.role}
                  </p>
                </div>
                
                <p className="text-slate-600 text-sm leading-relaxed flex-1 mt-2">
                  {member.description}
                </p>

                <div className="pt-5 mt-auto w-full border-t border-slate-100/80">
                  <a
                    href={member.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-50 rounded-xl hover:bg-indigo-500 hover:text-white transition-all duration-300 hover:shadow-md"
                  >
                    <Linkedin className="w-4 h-4" />
                    Connect
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Vision Section */}
        <section className="mt-24 text-center max-w-4xl mx-auto bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 rounded-3xl p-10 md:p-14 text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          {/* subtle animated glow */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-[80px] opacity-40 group-hover:opacity-60 transition-opacity duration-700"></div>
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500 rounded-full mix-blend-screen filter blur-[80px] opacity-40 group-hover:opacity-60 transition-opacity duration-700"></div>
          
          <div className="relative z-10 space-y-6">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Our Vision</h2>
            <p className="text-indigo-100 md:text-lg leading-relaxed max-w-3xl mx-auto font-medium opacity-90">
              We believe in leveraging technology to create transparent, efficient, and accessible systems. Our goal is to drive innovation and empower organizations through modern software solutions that build trust and scale seamlessly.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
