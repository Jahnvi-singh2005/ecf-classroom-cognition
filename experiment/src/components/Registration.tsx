import { useState } from 'react';

interface RegistrationProps {
    onSubmit: (data: {
        subjectId: string;
        sex: string;
        yearOfStudy: string;
        disciplineOfStudy: string;
    }) => void;
}

export default function Registration({
    onSubmit,
}: RegistrationProps) {
    const [subjectId, setSubjectId] = useState('');
    const [sex, setSex] = useState('');
    const [yearOfStudy, setYearOfStudy] = useState('');
    const [disciplineOfStudy, setDisciplineOfStudy] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const newErrors: Record<string, string> = {};
        if (!subjectId.trim()) newErrors.subjectId = 'Subject ID is required';
        if (!sex.trim()) newErrors.sex = 'Sex is required';
        if (!yearOfStudy.trim()) newErrors.yearOfStudy = 'Year of study is required';
        if (!disciplineOfStudy.trim()) newErrors.disciplineOfStudy = 'Discipline of study is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        onSubmit({
            subjectId: subjectId.trim(),
            sex: sex.trim(),
            yearOfStudy: yearOfStudy.trim(),
            disciplineOfStudy: disciplineOfStudy.trim(),
        });
    };

    const inputClasses = (field: string) =>
        `w-full px-4 py-3 rounded-xl border-2 transition-all duration-200 outline-none text-surface-800 bg-white/80 backdrop-blur-sm placeholder:text-surface-400 ${errors[field]
            ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-100'
            : 'border-surface-200 focus:border-primary-400 focus:ring-4 focus:ring-primary-100'
        }`;

    return (
        <div className="min-h-full overflow-y-auto flex items-center justify-center p-3 md:p-6">
            <div className="w-full max-w-lg">
                <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-primary-200/30 border border-white/50 p-5 md:p-10">
                    {/* Header */}
                    <div className="text-center mb-6 md:mb-8">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-linear-to-br from-primary-400 to-primary-600 text-white mb-4 shadow-lg shadow-primary-300/40">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <h1 className="text-xl md:text-2xl font-bold text-surface-900">Participant Registration</h1>
                        <p className="text-surface-500 mt-1.5 text-sm">Please fill in your details to begin the experiment</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
                        {/* Subject ID */}
                        <div>
                            <label htmlFor="subject-id" className="block text-sm font-semibold text-surface-700 mb-1.5">
                                Subject ID <span className="text-red-400">*</span>
                            </label>
                            <input
                                id="subject-id"
                                type="text"
                                value={subjectId}
                                onChange={(e) => setSubjectId(e.target.value)}
                                placeholder="Enter participant subject ID"
                                className={inputClasses('subjectId')}
                            />
                            {errors.subjectId && <p className="mt-1 text-sm text-red-500">{errors.subjectId}</p>}
                        </div>

                        {/* Sex */}
                        <div>
                            <label htmlFor="sex" className="block text-sm font-semibold text-surface-700 mb-1.5">
                                Sex <span className="text-red-400">*</span>
                            </label>
                            <select
                                id="sex"
                                value={sex}
                                onChange={(e) => setSex(e.target.value)}
                                className={inputClasses('sex')}
                            >
                                <option value="">Select</option>
                                <option value="Female">Female</option>
                                <option value="Male">Male</option>
                                <option value="Non-binary">Non-binary</option>
                                <option value="Prefer not to say">Prefer not to say</option>
                            </select>
                            {errors.sex && <p className="mt-1 text-sm text-red-500">{errors.sex}</p>}
                        </div>

                        {/* Year of Study */}
                        <div>
                            <label htmlFor="year-of-study" className="block text-sm font-semibold text-surface-700 mb-1.5">
                                Year of Study <span className="text-red-400">*</span>
                            </label>
                            <input
                                id="year-of-study"
                                type="text"
                                value={yearOfStudy}
                                onChange={(e) => setYearOfStudy(e.target.value)}
                                placeholder="Enter current year/semester"
                                className={inputClasses('yearOfStudy')}
                            />
                            {errors.yearOfStudy && <p className="mt-1 text-sm text-red-500">{errors.yearOfStudy}</p>}
                        </div>

                        {/* Discipline of Study */}
                        <div>
                            <label htmlFor="discipline-of-study" className="block text-sm font-semibold text-surface-700 mb-1.5">
                                Discipline of Study <span className="text-red-400">*</span>
                            </label>
                            <input
                                id="discipline-of-study"
                                type="text"
                                value={disciplineOfStudy}
                                onChange={(e) => setDisciplineOfStudy(e.target.value)}
                                placeholder="Enter your discipline/degree"
                                className={inputClasses('disciplineOfStudy')}
                            />
                            {errors.disciplineOfStudy && <p className="mt-1 text-sm text-red-500">{errors.disciplineOfStudy}</p>}
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            className="w-full py-3.5 rounded-xl bg-linear-to-r from-primary-500 to-primary-600 text-white font-semibold text-base shadow-lg shadow-primary-400/30 hover:shadow-xl hover:shadow-primary-400/40 hover:from-primary-600 hover:to-primary-700 active:scale-[0.98] transition-all duration-200 cursor-pointer"
                        >
                            Continue to Learner Self report
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
