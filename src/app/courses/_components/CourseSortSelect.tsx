'use client';

type CourseListSort =
  | 'LATEST'
  | 'LIKES_DESC'
  | 'NEAREST'
  | 'COURSE_DISTANCE_ASC'
  | 'COURSE_DISTANCE_DESC';

interface CourseSortSelectProps {
  value: CourseListSort;
  isEnglish: boolean;
  className: string;
  onChange: (value: CourseListSort) => void;
}

export function CourseSortSelect({
  value,
  isEnglish,
  className,
  onChange,
}: CourseSortSelectProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as CourseListSort)}
      className={className}
    >
      <option value="LATEST">{isEnglish ? 'Latest' : '최신순'}</option>
      <option value="LIKES_DESC">{isEnglish ? 'Most Liked' : '좋아요 많은순'}</option>
      <option value="NEAREST">{isEnglish ? 'Nearest (My Location)' : '가까운순(내 위치)'}</option>
      <option value="COURSE_DISTANCE_ASC">{isEnglish ? 'Shortest Distance' : '코스 짧은순'}</option>
      <option value="COURSE_DISTANCE_DESC">{isEnglish ? 'Longest Distance' : '코스 긴순'}</option>
    </select>
  );
}
